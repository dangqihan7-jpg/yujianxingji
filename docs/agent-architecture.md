# 五智能体规划与实时执行记录

在线候选使用 `POST /api/agent` 的 5 个智能体，按固定顺序执行：需求理解 → 地点推荐 → 日程编排 → 交通核算 → 冲突校验。每阶段独立执行、独立回退，页面显示真实状态，不展示推测的内心独白，不将动画当成实测耗时。

## 规划与来源

文字请求由需求理解阶段提取条件；操作请求使用已确认条件（`confirmed`）。地点推荐与日程编排使用模型选择目录地点与分日，失败时明确回退规则。交通核算沿用服务端查询与可行性判断，未知耗时保持未知；冲突校验结合程序审计和必要的模型取舍建议。程序保护合法地点、必去/排除和固定日期。

`agents` 每项保留 `{name,source,provider}`；来源固定映射为 `ai → AI 生成`、`rules → 规则回退`、`confirmed → 已确认条件`。完成只代表该阶段已执行，不保证预约、交通、预算和开放条件都已核实。混合执行如实显示来源，不将规则完成冒充模型成功。

候选接口只读，不保存或替换账号行程。完整结果展示地点、分日、决策依据与审计，用户点击确认后才应用。局部重排与离线规则流程保留。

## JSON 与 SSE 协议

默认返回完整 JSON，兼容旧调用与离线版。候选生成优先通过 Fetch POST 增加 `Accept: text/event-stream`；JSON 请求字段与原接口一致，不将参数或密钥放在 URL 中。

```json
{
  "operation": "select",
  "city": "洛阳",
  "days": 2,
  "start": "09:00",
  "mode": "driving",
  "maxHours": 6,
  "restMinutes": 30,
  "stops": [],
  "decision": {"intent": {"city": "洛阳", "days": 2}}
}
```

UTF-8 SSE 使用命名事件、JSON data 和空行分帧：

| 事件 | 时机 | 数据 |
|---|---|---|
| `start` | 当前阶段真正开始前 | `{tool,index,total:5,modelCalls}` |
| `progress` | 实际发起模型 HTTP 请求时 | 实际累计 `modelCalls` 及当前 `index/total` |
| `step` | 当前阶段完成后 | `{tool,label,status,source,index,total:5,modelCalls}` |
| `done` | 五阶段与结果组装全部完成后 | 完整结果 JSON，含 `draft/agents/agent/audit` |
| `error` | 超时等终止错误 | 可展示的错误，不发送可应用的半成品 |

`index` 从1开始。标签沿用后端 `stepLabel()`，来源来自真实执行。模型计数是实际 HTTP 尝试次数，包含失败；授权/配额拦下而尚未发出的请求不计入 HTTP 尝试。它不是 token、工具次数或准确费用。

响应使用防缓存/转换的 `Cache-Control` 和 `X-Accel-Buffering:no`。Node 通过 `scripts/http-response.mjs` 逐块转发、遵守背压，不先读取完整 `arrayBuffer()`；关闭连接会取消 Worker 响应和请求信号。SSE 每15秒发送不含业务进度的注释保活，避免阶段较长时代理空闲断开；现有 Nginx 默认识别关闭缓冲的头，无需新端口或密钥。

## 前端与降级

`buildCandidate()` 仅点亮收到的真实完成步骤；当前运行文案来自 `start` 事件。顶部显示第 N/5 个智能体及实际模型调用次数，来源逐项显示。普通用户渐显，`prefers-reduced-motion` 用户不播放渐显或人为延迟。

必须收到完整五步和匹配的 `done` 才展示最终候选并设置 `replayFinished`。确认按钮此前不可用，之后仍须用户点击。关闭、取消、修改条件或新一轮请求会中止旧请求、回放和迟到回调。

服务端直接返回 JSON 时消费同一份结果，沿用480ms回放，不重复请求。流断开、格式不完整或不支持流读取时说明降级，取消原流，最多重新请求一次 JSON，回放新请求实际返回的步骤，不混合两次记录。重试是新一次规划，也经过授权和配额；完全失败则保留当前行程且不提供应用按钮。用户主动取消、明确的验证/授权/限流 HTTP 错误不自动重试。`startAgentReplay()`、直接查看结果和减少动效时立即展开逻辑保留；480ms不代表工具耗时。

## 执行边界与配置

每次请求保留 `AGENT_LIMITS.modelCalls=6` 和 `timeoutMs=120000`。总120秒包含阶段等待和上游读取；取消或超时后不启动后续阶段。单次模型仍最多25秒。客户端每次传输另设125秒上限，覆盖连接头和响应体；即便网络卡住且没有 EOF，也会结束等待，SSE 路径最多回退一次 JSON，JSON 再失败则结束。已有真实请求不会因为断连被记为未调用。

`agent` 保留 `version:2`、`steps`、`modelCalls`、`toolCalls:0`、`mapCalls:0` 与 `limits`。工具/地图两个旧计数字段并非新的完整交通请求账本，不据此宣称交通阶段完全没有网络请求。

模型沿用服务端 `LLM_API_KEY/LLM_BASE_URL/LLM_MODEL/LLM_MAX_TOKENS`。身份和演示沿用 `STANDALONE_AUTH/LLM_PUBLIC_DEMO/LLM_DAILY_LIMIT/LLM_CLIENT_DAILY_LIMIT`，不增加智能体密钥。真实密钥不进前端、事件或仓库。本次不修改 `henan.json`、数据库结构、账号数据或密钥。

## 维护与验证

- `server.mjs`：五阶段、来源/计数、SSE、整体超时及取消。
- `decision.js/decision.css`：流读取、实时状态、回放降级和确认门禁，复用科技风变量与 `agent-steps`。
- `scripts/dev.mjs/scripts/http-response.mjs`：Node 流式转发与连接取消。
- `worker/index.js`：构建生成的完整部署代码，不手改。
- `scripts/test-agent.mjs`：JSON/SSE、模拟上游和执行边界。
- `scripts/test-agent-replay.mjs`：旧回放、实时流、降级、取消和应用门禁。
- `scripts/test-http-stream.mjs`：真实 Node HTTP 首块提前送达、断连及 JSON/HEAD 兼容。

运行 `npm run build`、`npm run validate` 和完整 `npm test`。外部模型与地图测试使用模拟响应；浏览器证据区分模拟流和线上规则请求，不作为真实模型效果研究。没有新增实时票价、天气、订票或讯飞托管 Agent 平台能力。

协议参考：[MDN SSE格式](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)、[MDN ReadableStream](https://developer.mozilla.org/en-US/docs/Web/API/Streams_API/Using_readable_streams)。
