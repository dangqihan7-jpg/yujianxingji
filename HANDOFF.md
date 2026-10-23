# 开发交接

这是《豫见行迹——河南周末游决策助手》的比赛原型源码，方便其他 AI 继续开发。

## 启动

需要 Node.js 24+、Python 3。

```sh
npm ci
npm run build
npm run validate
npm run dev
```

打开 http://127.0.0.1:8787 。默认规则功能不需要模型密钥。

```sh
node scripts/offline.mjs
```

可生成可双击的 index-offline.html。worker/index.js 已提交完整运行版本；dist 和离线 HTML 是可重建的生成产物。图片与原始作者文件已包含。

## AI 主导开发原则

用户已明确要求项目基于智能体，并以 AI 为主导。主规划入口使用 `/api/agent`，固定为 5 个智能体，名称与顺序为：需求理解 → 地点推荐 → 日程编排 → 交通核算 → 冲突校验。由模型选择景点、决定工具调用与分日安排；规则只做结果校验和明确标注的降级候选。不得将规则选点套一段 AI 文案当成智能体。工具执行只在服务端白名单内进行，最终候选由用户确认后载入。阅读 `docs/agent-architecture.md` 和 `travel-agent.mjs` 后再扩展。不要声称已有实时票务、自动订票、天气查询或讯飞 Agent 平台工作流。

## 当前状态与下一步

已部署到阿里云，独立身份认证、SQLite、IP HTTPS、高德与讯飞配置均已实现。阅读 `docs/deployment.md` 进行维护；不要按旧材料重复迁移或创建账号体系。当前源码覆盖河南 18 个市级目的地、95 个精选地点、20 条示例路线、42 张有来源说明的实景照片。

1. 阅读 `docs/province-coverage.md`；城市元数据统一维护在 `henan.json` 的 `cities`，新增地点保持固定 ID、县域归属、资料来源和参考定位说明。
2. 按 `docs/photo-maintenance.md` 补齐近期、有合法许可且未经改色的实拍，运行 `npm run photos:check` 查看缺图、出处缺失及疑似老照片。缺图与加载失败使用城市主题渐变占位，明确标注“照片占位”，不借用其他地点图片或生成图。
3. 更新预约和开放状态；目录里暂停开放的地点暂不自动推荐。路线不包含未经核算的交通、票价或排队保证。
4. 修改后运行 `npm run build`、`npm run validate` 和完整 `npm test`，检查电脑/手机布局与保存行为，再备份代码和 SQLite 后部署。

真实高德与讯飞密钥只配置在服务端，仓库不包含；不要提交 `.env`、数据库、`.local`、`dist`、离线生成页或临时报告。保留线上 `.local` 数据目录链接与原账号数据。已有授权允许同步该仓库和现有服务器；正常内容维护不需要重新创建基础设施。

PPT、策划书、视频和测试/部署文档位于 `materials`，部分比赛材料早于当前代码，团队与导师信息待填，尚无正式用户效果研究；能力说明以 README 和测试通过的现有代码为准。

首页轮播按北京时间每天零点自动换组，最多 10 张，保留实际拍摄日期；来源规则与日切机制见 docs/photo-maintenance.md。每天维护应检查十张轮播而非旧版五张，继续择图补缺，勿硬凑未审核照片。

候选通过 Fetch POST SSE 实时显示五智能体的真实步骤、来源和模型调用计数；流失败时最多一次 JSON 请求并沿用旧回放。Node 必须使用 scripts/http-response.mjs 流式转发，勿恢复 arrayBuffer 整体缓冲；关闭弹窗或修改条件应取消执行，保留 replayFinished 与确认后应用门禁。协议与测试见 docs/agent-architecture.md。

行程分享使用 /api/share 与只读 /s/:token，公开快照30天过期；发布须应用0004_trip_shares迁移。复用导出图的share-timeline.mjs分日数据，二维码由npm qrcode本地打包。新增分享测试已纳入全量20组；不得在分享JSON加入账号、原草稿、密钥或AI请求。构建前执行npm ci，详见docs/share.md。

首页显性AI入口由ai-hero.js/ai-hero.css实现，位于原照片轮播上方；复用openBrief条件确认、五阶段SSE和确认后应用，不新增后端规划分支。维护入口需保留用户文字、示例轮换暂停和减少动态效果。见docs/ai-homepage.md。

拍照识景点使用 `POST /api/vision`，由讯飞图片理解 WebSocket 服务（`wss://spark-api.cn-huabei-1.xf-yun.com/v2.1/image`，HMAC-SHA256 签名，domain 默认 `imagev3`）完成，图片只在请求内转发、不写入本站数据库。需要服务端 `XF_VISION_APPID`、`XF_VISION_APIKEY`、`XF_VISION_APISECRET`（图片理解应用的三件套，与海报 `XF_TTI_*` 分开配置）；不把星火文字模型权限当作图片理解权限。识别仅在明确匹配本地地点后显示手动加入入口，不能凭模型返回的任意ID修改草稿。配额复用 `model_usage`，使用独立 `vision:` scope，UTC日匿名3/登录10/全局100，失败尝试计数。真实模型尚未验收，不应宣称已经识别成功；配置后需实测龙门石窟和非景点照片。见 `docs/vision.md`。

旅行氛围样式由travel-theme.css统一，沉浸首屏仍复用ai-hero.js，滚动/结果/微反馈由travel-motion.js增强。动画仅transform/opacity，减少动态效果或缺观察器时内容始终可读；不得将结果入场当作实时模型思考，不得改变SSE/回放确认门禁。见docs/travel-ui.md。

当前行程问答使用独立 `POST /api/ask`，在规划/总览视图的底部抽屉展示，复用服务端 `LLM_*` 的 X2.5 配置，不新增密钥、不进入五智能体流水线、不改草稿。仅发送必要的行程快照，问答历史只留本页内存；禁止附带账号、原草稿、照片或备注元数据转发给模型或写入分享。配额使用 `ask:`，UTC日匿名10/登录30/全局200，不新增迁移。明确的某日数量用当日程序事实作答，保留未知分类与不存在日期提示；用户设置的开始时间不能被当成营业时间。未知票价、营业、预约与优惠采用保守兜底，“请以官方信息为准”须在限长后追加以免被裁掉。关键词守护不能替代事实核验，真实模型尚需单独验收，mock通过不代表实际回答质量。见 `docs/ask.md`。

首页语音输入由 `stt.js/stt.css` 与 Hero 生命周期 hooks 实现，`POST /api/stt` 接收最长60秒的16kHz/16bit/单声道原始PCM（二进制，不是WAV或JSON）。`stt-service.mjs` 通过讯飞 `iat-api.xfyun.cn/v2/iat` HMAC WebSocket 分片听写，使用独立 `XF_ASR_APPID/APIKEY/APISECRET`，不能下发前端。小时配额为UTC整点匿名3/登录10/全局100，复用 `model_usage` 的 `stt:` scope。结果只追加文字，不提交规划；切页/隐藏/重绘清理麦克风与请求。Nginx `/api/stt` 精确路由需要100秒读取超时，保留原HTTPS与其他接口配置。实际真人识别是否通过以 `docs/stt-verification.md` 为准，不把mock说成真实麦克风验收。
