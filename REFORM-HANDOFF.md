# 闭环改革第一期 — 开发交接（REFORM-HANDOFF）

- 基线：远程 main `026b884`（问答升级）
- 工作区：`~/workspace/yujianxingji-reform`，分支 `reform-closed-loop`（**未 push，未部署，未动线上**）
- 范围：只做任务书的三件（A 复盘入口、B AI 思考过程显性化、C v3 学习最小版）。没有改 `henan.json` 地点数据，没有动问答四点（带来源、未核实明说不知道、超范围拒绝、超时取消不卡死），没有改排序算法。

## 一、改了哪些文件

| 文件 | 改动 |
|---|---|
| `db/schema.ts` | 新增 `tripReviews` 表：复合主键 `(user_id, trip_id)`，字段 `payload`（JSON）、`created_at`、`updated_at` |
| `drizzle/0005_clever_tattoo.sql`、`drizzle/meta/0005_snapshot.json`、`drizzle/meta/_journal.json` | `drizzle-kit generate` 生成的新迁移（0005）。生产启动时 `scripts/dev.mjs` 按序自动应用，重启即建表，无需手动建表 |
| `server.mjs` | 新增 `buildAgentTimeline()`（timeline 字段）、`validateReview()`、`reviewEndpoint()`（GET/POST `/api/trips/:id/review`）、`learningSignalsEndpoint()`（GET `/api/learning-signals`）；`fourAgentPlan` 与 `agentEndpoint` 的规则回退分支接 timeline；路由注册了 `/api/trips/*/review` 与 `/api/learning-signals` |
| `decision.js` | 新增 `agentTimelineHTML()`（渲染时间线）、`refreshLearningSignals()`（拉学习信号）；`agentResultHTML` 在 steps 之后、final 之前插入时间线；`buildCandidate()` 预览后刷新学习信号 |
| `showcase.js` | `renderOverview()` 末尾追加复盘区块；新增 `reviewSectionHTML()`、`reviewSummaryHTML()`、`refreshReviewSummary()`（带缓存，按行程编号只拉一次）、`openReview()`、`fillReviewForm()`、`submitReview()`；总览点击处理 `data-overview-action="review"`；`generate()` 的建议对话框内容设置后刷新学习信号；`$('#reviewform').onsubmit=submitReview` |
| `journey.js` | 新增 `currentTripId`、`getTripId()`（sessionStorage `yujianxingji.tripId` 持久化，刷新沿用；不存在时生成 `trip_<36进制时间戳><随机>`）、`resetTripId()`（清空行程时换新编号） |
| `app.html` | `loadPreset()` 调用 `resetTripId()`；清空按钮调用 `resetTripId()`；`<div id="notice">` 前新增 `<dialog id="review">`（复盘表单：实际总花费数字输入、超时/值得多待下拉由当前行程地点填充、最终方案文本输入） |
| `decision.css` | 新增 `.agent-timeline`、`.learning-signals` 样式 |
| `showcase.css` | 新增 `.review-section` 与 `#review` 对话框表单样式 |
| `scripts/test-agent.mjs` | 第 200 行附近：SSE done 与 JSON 的全量比对改为先把两份 body 的 `timeline[].durationMs` 置 null 再比对（耗时是真实测量值，两次请求必然不同；其余字段仍逐项全量比对） |
| `scripts/test-reform.mjs` | **新增**：三件功能的测试套件（见“四、测试报告”） |

## 二、三个功能：用法与 API

### A. 复盘入口（最小版）

- 入口：行程总览页底部「出行复盘」区块 → 「写复盘」按钮（无行程时禁用）。匿名访客点击先弹登录。
- 字段（全部可选填，至少填一项；费用未知留空，**不填 0**）：
  - `actualCost` 实际总花费（元，数字，0–1000000）
  - `overtimeStop` 哪站超时了（下拉，当前行程地点）
  - `worthMoreStop` 哪站值得多待（下拉，当前行程地点）
  - `chosenPlan` 最终选了哪个方案（文本，≤200 字）
- 复盘按（账号，行程编号）保存：换示例、清空行程会换新编号；刷新页面沿用同一编号。重复提交覆盖上一单。
- API（均需登录，匿名 401；DB 不可用时 503）：
  - `POST /api/trips/:id/review` — body 为四字段 JSON；空单 400，非法费用/超长字段 400，行程编号须匹配 `^[A-Za-z0-9_-]{1,64}$/` 否则 404。返回 `{review:{tripId, actualCost, overtimeStop, worthMoreStop, chosenPlan, updatedAt}}`。
  - `GET /api/trips/:id/review` — 返回 `{review: <同上> | null}`，只能看到自己的复盘（用户隔离已测试）。
- 展示：总览页复盘区块显示已保存复盘的摘要（费用、超时站、值得多待站、最终方案、保存时间）；未复盘显示提示文案。

### B. AI 思考过程显性化

- 后端：`/api/agent` 的 JSON 与 SSE done 响应新增 `timeline` 数组（4 步，顺序固定）：
  1. `select` 查目录选点（来源 ai/规则）
  2. `amap` 查高德确认入口（来源 confirmed/规则）
  3. `audit` 检查器自查第 N 轮（名称含实际轮次，如“检查器自查第 2 轮”，最多 4 轮；detail 注明“最多 4 轮”）
  4. `fallback` 失败回退规则版（未触发时 `status:"skipped"`、detail“本次未触发回退”；触发时 `status:"completed"`、detail 写清“回退原因：…”）
- 每步含 `key/name/label/status/source/durationMs/detail`；`durationMs` 为真实测量毫秒（null 表示未知）。规则路径下 4 步齐全；强制规则分支（`engine:'rules'`）下回退步为 completed。
- 前端：智能体结果页在原有 5 条 steps 之后、最终方案之前渲染时间线（步骤状态、来源、耗时：<1000ms 显示“X 毫秒”，否则“X.X 秒”，未知显示“—”），底部注明“本次来源：AI/混合/规则”。**原有 `agent.steps` 严格保持 5 条、形状不变**（decision.js 与测试均断言，回归无损）。
- 问答四点未动。

### C. v3 学习最小版（明确标注“学习版·演示”）

- 规则：复盘里被 **≥2 名不同用户**标“值得多待”的地点类型（按目录名称匹配到 `scenic` 景点 / `food` 美食 / `stay` 住宿）才出信号；1 名用户不出；同一用户重复标同一类只计 1 次；不在目录里的地点名不计入。
- API：`GET /api/learning-signals`（匿名也可读）返回 `{demo:true, signals:[{category, label, users, places, hint}], note:"学习版·演示：仅展示复盘汇总信号，不改变排序算法"}`，其中 `hint` 为“根据复盘，X 类地点权重上调”。
- 前端：智能体候选预览与 `generate()` 的建议对话框里各有一行学习信号区；无信号时写明“至少 2 名用户标过同一类地点‘值得多待’后才会在这里提示”；有信号时逐条写“学习版·演示：…仅展示，不改变排序”；拉取失败写“复盘信号暂不可用”。
- **只展示，不静默改排序算法**。页面与文案里只写“学习版·演示”，绝不写成“已上线完整学习”。

## 三、本地验证（都在 `~/workspace/yujianxingji-reform` 里跑）

```bash
# 1. 构建（重新生成 worker/index.js）
npm run build
# 预期：Built local qrcode browser graph …; Built …/dist；无报错

# 2. 新套件
node scripts/test-reform.mjs
# 预期：Passed: review API (auth, optional fields, overwrite, isolation, validation), agent timeline (4 steps, audit rounds, fallback state, SSE/JSON parity), learning signals demo (2-user threshold, category aggregation, no sorting change), frontend wiring (timeline, review dialog, overview entry).

# 3. 本地启动冒烟
node scripts/dev.mjs
# 另起终端：
curl -s http://127.0.0.1:8787/ -o /dev/null -w "%{http_code}\n"   # 预期 200
curl -s http://127.0.0.1:8787/api/learning-signals
# 预期：{"demo":true,"signals":[],"note":"学习版·演示：仅展示复盘汇总信号，不改变排序算法"}
curl -s -X POST http://127.0.0.1:8787/api/trips/trip_smoke/review -H 'Content-Type: application/json' -d '{"actualCost":100}'
# 预期：{"error":"请登录后提交复盘"}（HTTP 401）
```

手动走查（本地 `http://127.0.0.1:8787`，需先注册/登录一个账号）：
1. 生成一趟行程 → 智能体结果页应出现 4 步时间线；总览页底部应出现「出行复盘」区块。
2. 点「写复盘」→ 只填“值得多待”保存 → 总览显示已复盘摘要；再提交一次改费用 → 覆盖上一单。
3. 换第二个账号，同一行程编号提交同一类地点“值得多待” → 再生成行程，候选预览应出现“学习版·演示：根据复盘，景点类地点权重上调（仅展示，不改变排序）”。

## 四、测试报告（2026-11-07 晚，Node v24.22.1）

- `test-reform`（新增）：**通过**。覆盖：复盘匿名 401、字段全可选/费用未知不填 0、空单与非法值 400、重复提交覆盖、用户隔离、DB 缺失 503；timeline 4 步键名与顺序、自查轮次 ≤4、未触发回退为 skipped、规则回退分支为 completed、SSE done 与 JSON 在耗时归一化后全量一致、agent.steps 仍为 5 条；学习信号 2 名用户阈值、类别聚合、未知地点名不计入、同一用户不重复计数；前端源码级接线检查（时间线、学习信号、复盘对话框、总览入口、样式、schema）。
- 其余 34 个套件**全部通过（exit 0）**，无一失败：test-agent、test-agent-replay、test-decision、test-ask（44 checks）、test-ask-ui、test-journey、test-regressions（66/66）、test-auth、test-startup-recovery、test-js-api、test-http-stream、test-edge-cases（12/12）、test-model-limits（14/14）、test-showcase、test-share、test-share-ui、test-revise、test-revise-ui、test-ai-hero、test-travel-hero、test-travel-motion、test-stt、test-stt-ui、test-vision、test-vision-ui、test-offline、test-mobile-export、test-map-loader、test-photo-media、test-province、test-check-photos、test-hero-photos。
- 未跑全量 validate（已知在 2G 服务器上跑 6770 秒被杀，本地也慢；任务书明确不跑）。

## 五、给用户在服务器上部署的步骤

**前提：先把分支合进 main 再部署。** 本分支未 push、未合并，服务器上的 `deploy-aliyun.sh` 是 `git reset --hard origin/main`，只认 main。

1. **本地（沙箱或他自己的电脑，不用服务器）**：确认无误后，把 `reform-closed-loop` 合并进 main 并 push 到 GitHub（合并前可先在 GitHub 上看 diff：共 13 个文件改动 + 3 个新增文件，见第一节表格）。
2. **阿里云服务器（112.124.35.179，root，SSH 登录后，Clash 规则模式、虚拟网卡关）**：在 `/opt/yujianxingji` 跑部署脚本（脱离式，避免 SSH 断线中断）：
   ```bash
   cd /opt/yujianxingji && bash scripts/deploy-detached.sh
   ```
   脚本会依次：备份 → `git fetch` → `reset --hard origin/main` → `npm ci` → `npm run build` → validate → 重启服务 → nginx reload。**注意 validate 这一步**：已知在 2G 机上极慢（第一轮跑 6770 秒被杀、第二轮跑过 9860 秒未完成），如果它再次长时间卡住，**不要直接重跑全套**：先看服务状态——build 已完成、服务已 restart 的话，新版 dist 已被载入（上次 026b884 就是这么上线的）；用下面第 3 步核实后再决定。
3. **核实（服务器终端）**：
   ```bash
   systemctl status yujianxingji.service --no-pager | head -12   # 应为 active，HEAD 应为合并后的新提交
   git -C /opt/yujianxingji rev-parse HEAD
   sqlite3 /var/lib/yujianxingji/travel.sqlite ".tables"          # 应含 trip_reviews
   sqlite3 /var/lib/yujianxingji/travel.sqlite "SELECT name FROM local_migrations WHERE name LIKE '%0005%';"
   ```
   再用浏览器打开 `https://112.124.35.179`：生成一趟行程看时间线、总览页看复盘区；登录后提交一次复盘验证写入。
4. **回滚**：如有问题，部署脚本每次自动备份（见脚本日志里的备份目录），或 `git -C /opt/yujianxingji reset --hard 026b884 && systemctl restart yujianxingji.service` 回到上一基线（trip_reviews 表留着无害，旧代码不读写它）。

## 六、已知限制与未做事项

- 学习信号目前只在候选预览与建议对话框展示；未接入任何排序逻辑（按设计）。
- 复盘只按行程编号区分行程：同一账号下、同一编号被清空重建后，旧复盘仍挂在该编号下（清空时换新编号，正常流程不会撞上）。
- 拍照识景点（缺 `XF_VISION_APISECRET`）、HTTPS 证书过期、问卷星停收三件事与本次改动无关，仍按原线处理。
- 未 push、未部署：合并不合、什么时候部署，等 Qihan 定。

---

# 闭环改革第二期 — 开发交接（追加）

- 基线：远程 main `026b884`；工作区 `~/workspace/yujianxingji-reform`，分支 `reform-closed-loop`（**未 push，未部署，未动线上**）
- 三件按顺序各做一件、测过一件再做下一件，各自单独提交：
  - （1/3）`fcdc8fd` v3 学习真正生效——复盘信号小幅加权候选排序
  - （2/3）`a53ef65` 演示模式——一键造模拟复盘、与真实数据隔离
  - （3/3）`a81d86c` 宿舍拼团最小版——建团、合并偏好、发起人定冲突
- 范围：只做任务书的三件。没有改 `henan.json` 地点数据，没有动问答四点，没有改排序算法本身（只在选点打分里加小幅加权）。

## 二期（1/3）v3 学习真正生效

### 改了哪些文件
| 文件 | 改动 |
|---|---|
| `server.mjs` | 新增 `LEARNING_BONUS=1`（写进代码常量并注明）、`LEARNING_SIGNAL_THRESHOLD=2`、`collectLearningSignals(env, extraRows)`（真实/演示行分开汇总再拼接）、`computeLearningWeights`、`learningAppliedBody`；`fourAgentPlan` 接 `useLearning` 与 `extraLearningRows`（模型路径把信号写进选点提示，规则路径走数值加权）；`agentEndpoint` 接请求体 `learning` 开关（`learning:false` 关闭）与 force-rules 分支加权；`/api/learning-signals` 返回新增 `weighting:{bonus:1, threshold:2}`，note 改为“生成行程时这类地点可小幅加权（+1，仅影响同分候选顺序），可在需求确认里关闭” |
| `decision-core.mjs` | `agentSelectRules(rawIntent, catalog, learningWeights)`：打分 = 兴趣命中（每项 3 分）+ 学习加权（+1）；返回新增 `learningApplied`（实际被选中的加权类别）；选点理由里写明复盘加权 |
| `travel-agent.mjs` | `agentRuleResult` 增加第 5 个可选参数 `learningWeights`，打分同样加权，返回新增 `learningApplied` |
| `decision.js` | 需求确认里新增学习开关（`#brieflearning`，默认开）；`readBrief` 保留 `learning` 标记；`buildCandidate` 传 `learning` 给 `/api/agent`；新增 `learningAppliedHTML`（结果页原因行：“因为复盘里 N 个人觉得 X 类地方值得多待，所以这类地点在候选里排前了（加权 +1，仅影响同分候选顺序）”）；`refreshLearningSignals` 文案改为加权已生效 |
| `decision.css` | 新增 `.learning-applied`、`.brief-learning` 样式 |
| `scripts/test-reform2.mjs` | **新增**：二期测试套件（第 1 件部分） |
| `scripts/test-share.mjs` | 修了一个一期留下的测试 bug（见“测试报告”） |
| `package.json` | `npm test` 接入 `test-reform.mjs` 与 `test-reform2.mjs` |
| `worker/index.js` | `npm run build` 重新生成的构建产物 |

### 用法与 API
- 加权规则：被 ≥2 名不同用户标“值得多待”的地点类型，在候选选点打分里 +1。一次兴趣命中计 3 分，所以 +1 只影响同分/接近的候选顺序；必去地点永远优先；分日与冲突校验在选点之后、不受加权影响。
- 开关：需求确认对话框里的“应用复盘学习（学习版）”复选框，默认开启；关闭后本次生成不加权。`/api/agent` 请求体 `learning:false` 同效。
- 响应：`/api/agent` 返回新增 `learningApplied:{enabled, mode:'weight'|'prompt', applied:[{category, label, users, places, bonus:1, demo}], note}`；模型路径下 mode 为 prompt（信号写进选点提示），规则路径下为 weight。结果页有原因行；无信号或已关闭时原因行明说“未应用加权”。
- 实测翻转例子（洛阳一天、无兴趣、目标 2 个）：无加权取目录前两个（龙门石窟、白马寺）；2 名用户复盘标西工小街“值得多待”后，候选变为（西工小街、龙门石窟）。

### 测试
- `test-reform2`（第 1 件部分）：**通过**。覆盖：合成小目录单元测试（无加权按目录顺序、有加权美食排第一、必去永远优先、兴趣命中 3 分压过加权 1 分、理由写明加权）；API 翻转（上例，含 force-rules 分支）；阈值（1 名用户不生效、无信号时开关开/关排序完全一致）；前端接线（开关、原因行）。
- 另：测试中抓到一个真 bug 并修了——`travel-agent.mjs` 里 `learningApplied` 声明在 `if(operation==='select')` 块内，return 在块外读不到（ReferenceError）；已改为块外声明、块内赋值。

## 二期（2/3）演示模式

### 改了哪些文件
| 文件 | 改动 |
|---|---|
| `db/schema.ts` | 新增 `demoReviews` 表：`session_id / user_label / trip_id / payload / created_at`，复合主键 `(session_id, trip_id)` |
| `drizzle/0006_grey_phantom_reporter.sql`、`drizzle/meta/0006_snapshot.json`、`drizzle/meta/_journal.json` | `drizzle-kit generate` 生成的迁移 0006；快照链已核对（0006 的 prevId = 0005 的 id），链不断 |
| `server.mjs` | 新增演示接口（见下）；`collectLearningSignals` 真实/演示分开汇总（演示行不再抬高真实信号人数）；`computeLearningWeights` 按类合并；`learningSignalsEndpoint` 接 `?demo=`；`agentEndpoint` 接 `demoSession`（含 force-rules 分支，补 `demo` 标记）；路由注册 3 个演示接口 |
| `decision.js` | 新增演示会话 helpers（`demoSessionId/demoOn/toggleDemo/clearDemoData/updateDemoControl`）；`briefEntryHTML` 加演示模式控制行；`refreshLearningSignals` 按演示状态带 `?demo=` 并加标注前缀；`learningAppliedHTML` 给演示条目加“（演示数据）”；`agentResultHTML` 加演示横幅；`buildCandidate` 传 `demoSession` 给 `/api/agent` |
| `showcase.js` | `#gallery` 点击委托加 `data-demo-toggle` / `data-demo-clear` 两路处理 |
| `decision.css` | 新增 `.demo-mode`、`.demo-banner` 样式 |
| `scripts/test-reform2.mjs` | 追加第二件用例（不改第一件用例） |

### 接口与用法
- `POST /api/demo/reviews/seed`，body `{sessionId}`，匿名可用。`sessionId` 须匹配 `/^[A-Za-z0-9_-]{1,64}$/`，否则 400。同一会话重复 seed 返回 `{seeded:false, count:4}`，不重复造行；每会话最多 6 行。固定 4 行：演示用户甲标龙门石窟“值得多待”（景点）、乙标白马寺（景点，两人达阈值出信号）、丙标西工小街（美食，只有 1 人不出信号）、丁一单含实际花费 486 与超时站龙门石窟（故事完整，不标值得多待）。
- `POST /api/demo/reviews/clear`，body `{sessionId}`：只删该会话的演示行（`DELETE FROM demo_reviews WHERE session_id=?`，绝不碰 `trip_reviews`）。返回 `{cleared}`；重复清返回 0。
- `GET /api/demo/status?session=<id>`：返回 `{active, count}`；缺参数返回 `{active:false, count:0}`，非法编号 400。
- `GET /api/learning-signals?demo=<sessionId>`：带参数时把该会话的演示信号合并进来（每条带 `demo:true`）；不带参数时只返回真实信号，演示行绝不混入；非法编号 400。
- `POST /api/agent` 请求体增加 `demoSession`：有值时查该会话的 `demo_reviews` 按 `extraLearningRows` 传给 `fourAgentPlan`（复用第 1 件加权），`learningApplied` 相关条目标 `demo:true`；不传时演示行不影响排序。
- 前端：开关在需求确认入口附近（`briefEntryHTML` 的 `.brief-compose` 末尾：开启/关闭按钮 + “一键清空演示数据”按钮 + 一句说明）。状态存 `sessionStorage`（`yujianxingji.demoSession` / `yujianxingji.demoOn`，会话 id 形如 `demo_<随机>`）。开启时先调 seed 再拉信号；关闭时不自动清数据，清空必须点按钮。演示开启期间，智能体结果页出现横幅“演示模式 · 以下含演示数据”，学习信号区与原因行同样标注，演示信号条目后缀“（演示数据）”。
- 演示故事操作路径：关演示生成一次（第一版、无加权）→ 开演示再生成一次同类需求（景点类排前、原因行写明演示数据）→ 一键清空后信号消失。

### 测试
- `test-reform2`（追加部分）：**通过**。覆盖：seed 幂等与 4 行（≤6 行上限）、非法 `sessionId` 400、clear 只清演示数据（真实复盘与真实信号原样保留，重复清返回 0）、不带 `demo` 参数时信号里没有演示行、带参数时演示信号 `demo:true` 且美食类 1 人不出信号、`/api/agent` 传 `demoSession` 时加权生效且 `learningApplied` 标 `demo:true`（含 force-rules 分支）、不传时演示行不影响排序、前端接线检查。
- 关键设计修正（第 1 件留下的隐患）：第 1 件的 `collectLearningSignals` 是把演示行直接并进同一类目计数，会让演示用户抬高真实信号的人数；第 2 件改为真实信号与演示信号分开汇总再拼接，加权时再按类合并。后果：`/api/learning-signals?demo=` 在同类两边都达阈值时会返回两条同类信号（一条真实、一条演示），加权端合并为一条，展示端未合并。

## 二期（3/3）宿舍拼团最小版

### 改了哪些文件
| 文件 | 改动 |
|---|---|
| `db/schema.ts` | 新增 `groups` 表（id 主键、name、creator_id、max_members、created_at）与 `group_members` 表（group_id、user_id、payload、joined_at，复合主键 `(group_id, user_id)`） |
| `drizzle/0007_polite_havok.sql`、`drizzle/meta/0007_snapshot.json`、`drizzle/meta/_journal.json` | `npm run db:generate` 生成的新迁移（0007）；快照 prevId 链已核对不断（0007 的 prevId = 0006 的 id） |
| `server.mjs` | 新增拼团整套服务端逻辑；把 `/api/agent` 的执行体抽成共用函数 `agentBodyForRaw()`，agentEndpoint 与拼团 plan 共用——有模型走 `fourAgentPlan`，无模型/强制规则走 `agentRuleResult`，响应同样带 timeline 与 learningApplied；路由注册了 `/api/groups*` |
| `decision.js` | `briefEntryHTML` 演示控制行旁加「宿舍拼团」入口；新增拼团对话框全部逻辑（`openGroup`、`renderGroupList`、`openGroupDetail`、`renderGroupDetail`、`submitGroupJoin`、`submitGroupPlan`、`renderGroupPlan`、`applyGroupPlan`、`groupIdsFromNames` 等）及 `#group` 点击委托 |
| `showcase.js` | gallery 点击处理加 `data-open-group` → `openGroup()` |
| `app.html` | `<div id="notice">` 前新增 `<dialog id="group">`（内容由 JS 渲染进 `#groupbody`） |
| `decision.css` | 新增拼团相关样式（`.group-entry`、`.group-create/.group-join/.group-plan`、`.group-list/.group-item`、`.group-members/.group-merged/.group-conflicts`、`.group-resolutions`、`#group` 对话框样式） |
| `scripts/test-reform2.mjs` | 追加第三件用例（一、二件用例一行未改，只改了末尾的 Passed 文案） |
| `worker/index.js` | `npm run build` 重新生成的构建产物 |

### 接口与用法
- 全部接口需登录（独立模式只认会话 cookie，平台模式认平台头；匿名一律 401）；DB 不可用时 503。团 id 为 `grp_` + 16 位随机十六进制。
- `POST /api/groups`，body `{name（1–40 字）, maxMembers（整数 2–8，默认 6）}`：建团，发起人自动成为成员（偏好初始为空）。返回 `{group:{id, name, maxMembers, creatorId, creatorName, memberCount:1, createdAt}}`。非法团名/人数 400。
- `GET /api/groups`：列出全部团（id、name、memberCount、maxMembers、creatorId、creatorName、createdAt），供加入时挑选。
- `POST /api/groups/:id/join`，body `{requiredIds?, excludedIds?, budget?}`，三项全可选（空 body 即空偏好加入）。偏好校验复用 `validateIntent`（只传三项）：地点 id 须在目录内且 ≤15 个，同一成员必去与排除不能是同一点，budget 为数字 0–100000 或 null；非法 400。团不存在 404；团满员（成员数 ≥ maxMembers）409；重复加入视为更新偏好，不重复计数（joinedAt 保持首次加入时间）。
- `GET /api/groups/:id`：团详情。非成员只能看到团名、成员数与发起人（`{group, me:null}`，无 members/merged/conflicts）；成员能看到全部：成员名单（用户名；平台/测试模式下用户名为空时回落为用户 id）、合并偏好、冲突清单。合并规则：必去取并集、排除取并集、预算目标取成员所填最小值（保守口径），并在响应里标明各成员预算的 spread（`{min, max}`）与逐人预算。冲突清单 = 必去与排除的交集（跨成员产生的）+ 不在目录里的必去 id，每项 `{placeId, name, requiredBy:[用户名], excludedBy:[用户名]}`。
- `POST /api/groups/:id/plan`，body `{city, days, mode?, maxHours?, restMinutes?, resolutions?}`：只有发起人能调用，非发起人 403。city 须在目录城市内、days 须为 1/2/3/4/5/7，否则 400。若存在未解决的冲突且 resolutions 未覆盖全部冲突点，返回 409 `{conflicts:[{placeId, name, requiredBy, excludedBy}]}`；resolutions 格式 `{placeId: 'required'|'excluded'}`，非法值 400，不在目录里的必去地点定为 required 时 400（只能定为 excluded）。解决后（或无冲突时）用合并偏好生成行程：服务端用 `agentContext(raw)` 构造上下文（operation:'select'），再走与 `/api/agent` 相同的管线（`agentBodyForRaw`），学习加权同样生效。返回与 `/api/agent` 同形的候选结果，外加 `group:{id, name, members:[用户名]}`、`label:'拼团行程'` 与 `merged`（定夺后的合并偏好）；draft 的 stops 包含全部合并后的必去地点。合并后必去地点超过 15 个时 400（管线硬上限）。
- 前端用法：首页需求确认入口旁点「宿舍拼团」→ 对话框里建团（团名+人数上限）→ 在团列表点「查看」→ 加入表单按地点名输入偏好（名字、逗号分隔，如「龙门石窟、白马寺」；预算可留空）→ 成员名单、合并偏好、冲突清单实时可见 → 成员点「生成拼团行程」（目的地默认按合并必去地点推断，单城则为该城、多城则为河南多城；有冲突时发起人逐项选必去/排除）→ 展示拼团行程候选（含「拼团行程」标注与成员名单、AI 思考过程时间线、学习加权行）→ 点「应用拼团行程」复用 buildCandidate 的载入流程（`/api/validate` 校验 + `applyDraft` 载入，关闭对话框、跳到行程检查页）。非发起人点生成时显示「只有发起人能生成拼团行程」（服务端 403 触发；登录态已知且非发起人时按钮下方也预先注明）。
- 本地冒烟实测：alice 加入（必去龙门石窟、预算 500）、bob 加入（必去白马寺、排除龙门石窟、预算 200）→ 合并必去 {龙门石窟，白马寺}、排除 {龙门石窟}、预算目标 200、spread {200, 500}；冲突 1 处（龙门石窟，requiredBy alice，excludedBy bob）；无 resolutions 的 plan → 409；resolutions `{hn-longmen:'required'}` 的 plan → 200，label「拼团行程」，stops 含龙门石窟与白马寺，timeline 4 步。

### 测试
- `test-reform2`（第三件部分）：**通过**。覆盖：建团/列表/加入的鉴权（匿名 401，含无 DB 时 503）、校验（非法偏好 400、团名/人数校验、团不存在 404）、团满 409、重复加入更新不重复计数（memberCount 与 joinedAt 不变）、偏好合并（并集、预算取最小值 200、spread {min:200,max:500}）、冲突明示（跨成员必去×排除进清单，含 requiredBy/excludedBy）、plan 未解决时 409 且带 requiredBy/excludedBy、发起人 resolutions 解决后生成成功（定必去与定排除两种结果都验）、非发起人 plan 403、plan 参数校验 400、行程生成（draft 含全部合并必去地点、label 为「拼团行程」、成员名单齐全、timeline 4 步、learningApplied 存在）、学习加权在拼团行程里生效（2 人美食信号 → 洛阳 1 天必去龙门石窟时西工小街被抬进候选，applied food/2 人/+1）、隐私（非成员看不到 members/merged/conflicts）、不在目录里的必去 id（直接写库模拟旧偏好：进冲突清单、plan 409、定 required 时 400、定 excluded 后生成成功）、前端接线检查、空 body 加入视为发表空偏好。
- 测试中修掉的两个真问题（已进提交）：① `validateIntent` 抛无 status 的普通 Error 时外层会变 500，`groupPreference` 内已包一层转 400；② 读库时曾用带目录校验的解析函数，导致已存的未知地点偏好被悄悄丢掉、冲突清单出不来，现读库只做结构解析、不校验目录。

## 二期本地验证（都在 `~/workspace/yujianxingji-reform` 里跑）

```bash
# 1. 构建（重新生成 worker/index.js）
npm run build
# 预期：Built local qrcode browser graph …; Built …/dist；无报错

# 2. 新套件
node scripts/test-reform.mjs
# 预期：一期全部通过
node scripts/test-reform2.mjs
# 预期：Passed: learning weighting (unit ties, API flip, threshold, off-parity, rules branch), frontend wiring (toggle, reason line), demo mode (seed idempotence, isolation, clear, agent demoSession, frontend wiring), group trips (auth, validation, full-group 409, re-join update, preference merge, conflict list, plan 409/403/resolutions, privacy, learning weight, frontend wiring).

# 3. 全量测试
npm test
# 预期：全部套件 exit 0（已含 test-reform 与 test-reform2）
```

手动走查（本地 `http://127.0.0.1:8787`，需先注册/登录一个账号）：
1. 演示：关演示生成一趟洛阳行程（无加权）→ 开演示（seed 4 行）再生成同类需求 → 景点类排前、原因行写明演示数据 → 一键清空后信号消失。
2. 拼团：建团 → 换第二个账号加入并填偏好 → 详情页看合并偏好与冲突 → 发起人定夺冲突 → 生成拼团行程 → 应用后跳到行程检查页。

## 二期测试报告（2026-11-07 晚，Node v24.22.1，`npm test` exit 0）

- `test-reform`（一期）：**通过**。
- `test-reform2`（二期三件）：**通过**（见各件小节）。
- 其余全部套件**全部通过（exit 0）**，无一失败。
- 未跑全量 validate（已知在 2G 服务器上跑 6770 秒被杀，本地也慢；任务书明确不跑）。
- 一期留下的测试 bug 已修（见下节）：此前一期交接称“其余 34 套件全过”不准确——在 d2fdad0 上复核，`test-share` 实际是失败的；本次已修复，`npm test` 现为真实全过。

## 二期修掉的一期遗留测试 bug

- `test-share.mjs` 断言“最后一个迁移文件建 shares 表”（`migrations.at(-1)` 匹配 `CREATE TABLE \`shares\``）。一期新增迁移 0005（trip_reviews）后，最后一个迁移已不是建 shares 表的那一个，该断言在 d2fdad0 上实际失败（一期交接“34 套件全过”的说法不准确，已在干净 worktree 上复核确认）。修法：改为断言“任一迁移建 shares 表”，且最后一个迁移不含 DROP/ALTER；原断言的其他意图（已有表保留、快照链）未动。修后 `test-share` 通过（17 checks）。

## 二期已知限制与未做事项

- 学习加权只在选点打分层生效：模型路径下信号以提示方式告诉模型（mode:'prompt'），规则路径下为数值加权（mode:'weight'）；分日与冲突校验不受加权影响。
- `/api/agent` 与拼团 plan 共用 `agentBodyForRaw`：规则分支的 `learningApplied.enabled` 沿用 `agentRuleResult` 的旧语义（无信号时为 false，有信号时为 true），与 `fourAgentPlan` 分支（开关开即 true）不一致——这是两分支原有的不一致，本次未改，保持与 `/api/agent` 同形。
- 演示 seed 是固定 4 行、固定会话内行程编号（`demo_trip_a`–`d`）；同一会话无法造第二套不同演示数据（重复 seed 幂等返回已有 4 行）。要换故事须先清空再 seed（仍是同一套）。
- 演示会话 id 只存在浏览器 `sessionStorage`：换浏览器/清会话存储后旧演示行留在库里无人认领（无过期清理；`GET /api/demo/status` 可查，但无后台清理任务）。答辩现场建议用同一浏览器标签页走完全程。
- 演示接口匿名可用、无鉴权：任何人拿到 `sessionId` 都能 seed/clear 该会话的演示行；但只能动 `demo_reviews`，真实复盘与账号数据不受影响。
- `GET /api/learning-signals?demo=` 在真实与演示同类都达阈值时会返回两条同类信号（一条真实、一条演示），加权端合并为一条，展示端未合并。
- 合并后必去地点超过 15 个时拼团 plan 返回 400（管线硬上限，无自动删减）；合并后排除并集超过 15 个时由 `validateIntent` 静默截断到 15 个（多余排除可能失效），属极端情况，未做额外处理。
- 拼团前端偏好输入是按地点名文本输入（逗号分隔），未做下拉多选；未输入名字匹配不到目录时只提示、不自动联想。
- 拍照识景点（缺 `XF_VISION_APISECRET`）、HTTPS 证书过期、问卷星停收三件事与本次改动无关，仍按原线处理。
- 未 push、未部署：合并不合、什么时候部署，等 Qihan 定。部署时与一期相同：先合进 main 再在服务器跑部署脚本，迁移 0006（`demo_reviews`）与 0007（`groups`、`group_members`）会由启动流程按序应用。

