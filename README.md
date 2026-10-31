# 豫见行迹 河南周末游决策助手

以 5 个智能体协同为核心的河南周末游决策助手，接入讯飞模型与高德地图。覆盖河南 18 个市级旅行目的地（17 个省辖市及济源），内置 95 个精选地点及 20 条可编辑示例路线。包含万岁山、老君山、宝泉、胖东来天使城、神垕古镇和南湾湖等玩法。县域目的地按所属城市归类，支持地名别名搜索与需求识别。当前包含 42 张真实照片，附作者、许可与拍摄对象说明。

在线演示：[豫见行迹](https://112.124.35.179/)。阿里云独立部署使用自建账号与 SQLite；高德和讯飞模型已配置，登录后可使用模型，访客使用规则规划。HTTPS 使用 IP 证书，配置与续期说明见 [部署文档](docs/deployment.md#阿里云-ip-https)。

“分享行程”可生成30天有效的公开只读链接，支持复制与本地二维码；分享页按DAY时间线展示，无需登录，不含账号信息。匿名每天3次、登录每天10次、全局每天100次，过期链接显示中文404。详见 [分享接口、迁移与验证](docs/share.md)。

首页提供“拍照识景点”入口：选择清晰原始照片，浏览器将最长边缩至1024px、转为JPEG后交由讯飞图片理解服务识别。结果显示名称、城市与AI简介，匹配本地地点时可手动加入草稿；未收录的地点只展示识别结果。照片不写入本站数据库，也不会自动加入行程。此能力需要单独配置图片理解服务，不能仅凭已有文字模型权限启用；本轮采用模拟上游验证流程，真实照片识别准确率仍待配置后验收。接口、授权和配置见 [拍照识景点](docs/vision.md)。

首页一句话输入框支持可选语音输入：点击麦克风开始、再次点击结束，最长60秒，讯飞听写结果追加到现有文字后，可编辑并手动提交。录音仅在明确点击后采集，隐藏页面或离开首页会取消，不保存音频；浏览器麦克风权限不可用时继续手动输入。此服务需单独配置 `XF_ASR_APPID`、`XF_ASR_APIKEY`、`XF_ASR_APISECRET` 并开通“语音听写（流式版）”；未配置返回明确503。协议、小时额度与真实验收边界见 [语音输入验收](docs/stt-verification.md)。

规划与行程总览提供悬浮 AI 问答入口，可询问当前行程的地点、分日安排与已知信息。问答直接调用星火 X2.5，不重新规划或修改草稿，历史仅保留在本页内存。明确的某日地点数量由程序核对；未核实的票价、营业与预约采用保守兜底，相关回答附“请以官方信息为准”；界面标注“AI 回答仅供参考，出行前请核实”。独立额度为UTC日匿名10次、登录30次、全局200次，复用现有文字模型配置；接口与真实模型尚待验收的边界见 [当前行程问答](docs/ask.md)。

页面默认进入主题路线展厅，新用户初始草稿为“洛阳 · 两日慢游”，已有账号恢复原草稿。四个视图分别呈现主题路线、地图规划、行程总览和行程检查。用户可以描述周末旅行需求并确认条件，生成候选行程，切换城市、筛选景点、美食和住宿、查看详情和实景照片、修改日期、顺序与停留时间，再导出或导入 JSON 行程。

## 河南全省探索

首页可按旅行片区筛选 18 城，也可搜索城市、县域或景点；城市卡片提供介绍、美食方向、代表地点、两日路线和公开资料来源。选择卡片只切换预览，通过明确的规划、地图或载入入口才应用相应操作。地图、需求解析、保存校验、模型允许城市和离线版共用同一份城市目录。

20 条路线是可编辑的建议组合，尚未核算景区内部交通、排队、预约及实际费用。精选坐标经高德参考点核对，仍须确认导航入口；村落和古城的行政参考点不能当作售票入口。高德标注暂停开放的开封市博物馆、豫西大峡谷保留资料入口，但暂不自动选入候选或示例路线。详见 [全省覆盖与维护](docs/province-coverage.md)。

## 旅行决策与验证

- 规划页的“和 AI 调整这一天”与问答抽屉内的调整入口支持对话式单日修改：选择日期、勾选要保留的地点、输入要求，先查看新增/移除/顺序/停留时长的变化，再确认应用。其他日期和已锁定、必去地点受程序保护；原 `/api/ask` 仍只读。复用现有讯飞文字模型配置和规划额度，不新增密钥。边界、接口与验证见 [单日行程调整](docs/trip-revision.md)。
- 候选生成优先通过 SSE 实时展示五智能体状态、实际模型调用次数与来源（AI 生成 / 规则回退 / 已确认条件）。流不可用时消费 JSON 或最多重新请求一次，沿用480ms事后回放；减少动效时直接展示。重排仍保留回放；完整结果后仍需明确确认才应用候选。
- 需求入口提取城市、天数、交通方式、每日上限、休息、人均预算、主题和明确提及的必去地点；确认后才应用。缺模型时使用文字规则识别，明确显示来源。模型请求只使用目录地点 ID，结构化条件经验证后才能进入规划。
- 候选选点按已确认的城市与主题在精选目录中匹配；分日可由规则或已配置模型提出。只有用户点击替换后才改草稿；新候选将费用重置为待填，保留完成的体验记录。
- 固定某站的日期后，规则与模型输出都必须保留该日期。支持只重排某一天，其他天的地点、顺序和停留时长不变。时长上限是规划目标，不能把算法的软惩罚表述为可行性保证。
- 检查游览加休息与已核算交通的时长、目的地及跨城条件、必去地点缺失，以及用户填写的人均费用。未提供的费用和交通显示未知，不计为已满足；预约、营业时间和无障碍条件尚未核验。
- 交通缓存仅限本次页面，30 分钟后在时间线、地图、总览和检查页统一失效。路线变化后需重新查询。
- 可开始一次体验任务计时，记录编辑操作数、结束时的未确认项、评分与文字反馈，并导出原始 JSON。原先方法用时为用户自行填写，不自动生成效率提升结论。完成的记录与行程一同按账号保存，最近保留 20 条；访客仅保留本页状态，可导出留存。记录尚不构成正式用户研究。

## 展示与数据

米白、墨色与朱砂红界面，以每日十张实景照片轮播、周末新玩法、需求输入、三条主题路线与六城入口引导用户开始规划；地图规划和分日行程册使用同一套配色。手机端提供分区导航，动效遵循减少动态效果设置。设计与维护说明见 [前端 UI](docs/ui-design.md)。行程总览提供打印，并在应用规划后显示实际的调整前后指标。河南全景按城市聚合标记，进入城市后展示地点；高德组件在地图视图可见时才初始化。

“体验规划对照”演示将五处地点集中放在第一天，再用规则按每日六小时上限与半小时休息分日。预览不修改原草稿，只有明确载入后才应用，且可以撤销。对照只统计游览与休息，未核算交通不计为零。修改草稿后过时对照自动隐藏。

- 精选资料来自公开文旅信息，每个地点附来源链接。精选坐标是片区展示定位，不用于导航。
- 美食和住宿分类通过高德搜索；高德不可用时保留精选内容，不编造酒店、营业信息或图片。
- 地图状态分别显示加载中、加载完成与加载失败；慢加载仍可恢复，并提供重试按钮。
- 精选详情可跳转到站内高德查询。核算交通时先由用户确认匹配地点或入口；支持驾车、公交和步行，每天 2–9 个点。公交核算限同城，跨城车次另行确认。
- 模型服务不是展示版的必需项。未配置时，规则先按城市和相对位置组织地点，再按每日游览负荷与休息分日。互动示例固定使用规则，不随模型配置变化。
- 核算后时间线累计游览停留、查询时高德站间预计耗时与用户选择的休息预留，并对每日时长上限和跨城行程提示。未获取的交通耗时标记为待核算，景区内部交通、排队和预约仍需另行确认。
- 网站行程按用户 ID 保存：平台模式使用 D1，阿里云独立模式使用自建账号和 SQLite，刷新后恢复。保存失败保留当前输入并提示重试；并发版本冲突拒绝覆盖。提供撤销、恢复示例及 JSON 导入导出，输出只包含必要字段。历史行程读取成功前暂停编辑，读取失败不会覆盖历史版本。
- 离线文件 `index-offline.html` 嵌入 42 张实景照片与全部精选资料，可以断网展示景点详情、路线载入、行程编辑、规则整理和导入导出；离线文件不连接账号保存；高德地图、实时餐饮住宿查询和道路路线需要联网。

## 构建

运行时无需 npm 依赖；使用 Node 24+ 和 Python 3。数据库迁移开发依赖锁定版本的 Drizzle。

```sh
npm ci
npm run build
npm run validate
node scripts/test.mjs
node scripts/test-js-api.mjs
node scripts/test-map-loader.mjs
node scripts/offline.mjs
node scripts/test-offline.mjs
node scripts/test-journey.mjs
node scripts/test-showcase.mjs
node scripts/test-province.mjs
node scripts/test-decision.mjs
node scripts/test-regressions.mjs
node scripts/test-model-limits.mjs
node scripts/test-edge-cases.mjs
node scripts/test-auth.mjs
npm run dev
```

`app.html`、`journey.js`、`showcase.js`、`decision.js`、`decision-core.mjs` / `travel-agent.mjs`、四份样式（`styles.css`、`showcase.css`、`decision.css`、`ui.css`）、`server.mjs` 和 `henan.json` 是作者源文件。决策核心在服务端、浏览器与离线版共享。组装脚本插入精选资料、路线和图片，生成自包含 `worker/index.js`；部署入口是 `dist/server/index.js`。D1 绑定为 `DB`，Drizzle 的已生成迁移随构建复制到 `dist/.openai/drizzle`，发布时应用，不在运行时建表。保存 API 只接受平台认证用户身份。

## 服务端配置

- `AMAP_JS_KEY`：浏览器地图 Key。
- `AMAP_SECURITY_JS_CODE`：地图安全密钥，只在服务端使用。
- `LLM_API_KEY`：讯飞 MaaS API管理页的 ak- 开头凭据，保存为服务端 secret。
- `LLM_BASE_URL=https://maas-api.cn-huabei-1.xf-yun.com/v2`；`LLM_MODEL` 填写密钥已开通的模型 ID，如 `spark-x2.5` 或 `spark-x2.5-1.7b`。
- `LLM_MAX_TOKENS=4096`：回复长度请求参数；不代表含思考Token的账单硬上限。
- `LLM_PUBLIC_DEMO=true`：开启有额度限制的公共演示。需要 D1 的 model_usage 表，否则回退规则。
- `STANDALONE_AUTH=true`：独立服务器部署时启用自建账号登录（注册/登录/会话 cookie），替代平台注入的 `oai-authenticated-user-id` 身份；独立模式下客户端提交的该头一律忽略。默认不启用。
- `LLM_DAILY_LIMIT=120`、`LLM_CLIENT_DAILY_LIMIT=10`：按 UTC 日限制调用尝试次数；失败也计数，不重试模型。匿名访问使用服务端IP的加盐哈希，数据库不保留原IP，7天清理。IP缺失时共享额度；不是强账户配额或精确金额上限。
- `XF_VISION_APPID`、`XF_VISION_APIKEY`、`XF_VISION_APISECRET`：图片理解 WebSocket 服务（`wss://spark-api.cn-huabei-1.xf-yun.com/v2.1/image`）所在应用的三件套，三项都必须配置，走 HMAC-SHA256 签名（与海报同机制、不同凭据，不要混用）。`XF_VISION_DOMAIN` 可选，默认 `imagev3`（高级版），基础版填 `general`。匿名每天3次、登录每天10次、全局每天100次，按UTC日计数；详见 [图片理解配置](docs/vision.md#服务端配置)。

X2.5 请求不发送 response_format、tools 或 thinking_budget。仅对 MaaS 上的 `spark-x2.5-1.7b` 发送 `thinking: {type: "disabled"}`，避免长时间思考耗尽25秒窗口、无法返回最终JSON；该配置已在真实接口验证，其他模型保持原有请求参数。只读取最终 content，进行JSON与业务约束校验。未配置、模型异常、25秒超时、非法结果或额度不足时，HTTP200返回 source=rules 与 fallback.reason（明确请求规则/未配置除外），显示原因。生成候选不会自动修改草稿；用户确认后才应用。固定日期、地点完整性、明确排除和完整数字由程序保护。小数天数会转为待确认；分组金额与千/万单位完整解析；并列否定条件逐项保留。跨游览日城市发生变化时，城际转场仍标记待核算，不把每日内部交通可用误当成全程可行。预算采用整数分求和，避免浮点误差。官方协议：https://www.xfyun.cn/doc/spark/推理服务-http.html

### 本地复现与保存

`npm run build` 自动组装作者文件并打包。修改数据库结构才运行 `npm run db:generate`；已有迁移不得重写。`npm run dev` 仅监听 127.0.0.1:8787，用 Node24 内置 SQLite 按顺序应用迁移，数据库位于未提交的 `.local/travel.sqlite`。默认不连接高德和模型，规则功能可直接验证。若测试账号保存，可向本地 API 请求添加 oai-authenticated-user-id 测试身份；该头只用于本地夹具，线上由平台注入，不能当作自行实现的登录。线上访客只保留当前页草稿，须导出；平台认证用户保存最新行程，页面撤销最多20步，未实现服务器历史版本。

本地如需在线服务，通过终端已有环境变量传入上述配置，勿将真密钥写入源码或示例文件。`node scripts/offline.mjs` 生成可双击的 index-offline.html，只包含规则、精选资料与嵌入图片，不连接道路地图或模型。

地图采用安全代理与固定上游白名单；浏览器不接收地图安全密钥或模型 Key。行程导入、模型返回和地点完整性均校验后使用。

## AI 主导的智能体规划

主入口是 `POST /api/agent`，由 5 个智能体按固定顺序执行：需求理解 → 地点推荐 → 日程编排 → 交通核算 → 冲突校验。各阶段独立回退并如实标注来源。模型选择目录地点与分日，程序保护合法地点、必去/排除与日期，核对已知交通和冲突。未知费用、开放、预约或耗时保持待确认，候选需用户确认后才载入。

增加 `Accept: text/event-stream` 可接收实时 `start/progress/step/done` 事件，默认 JSON 响应兼容旧调用方。每次请求最多6次模型调用、120秒总等待，各次调用经过授权和配额控制。断连可取消执行；流失败时保留回放降级与应用门禁。密钥只在服务端配置，不增加智能体密钥，不修改地点目录。详见 [智能体架构与扩展](docs/agent-architecture.md)。

本轮新增 25 项智能体自动检查；模型与高德响应均采用模拟数据，未消耗真实 API。本轮电脑 1280px / 手机 390px 验证也使用模拟模型；真实模型按当前服务配置接入，需以实际调用结果判断规划质量。实时票价、预约、天气、自动订票尚未实现。

## 实景照片

首页按北京时间每天零点从已审核的本地实景库轮换 10 张，优先当年及上一年照片；同一天选择固定，页面跨日或从后台恢复时自动更新。照片不足 10 张时按实际数量展示，不重复或借用未审核图片凑数。每日精选日期是换组日期，各照片仍显示真实拍摄日期与来源；维护任务继续寻找有明确授权的新照片。

照片审计以当前 `henan.json` 为准：95 个地点中 42 处有图、53 处待补。2026-10-16 补充戚城与商丘古城后更新数量；[无图清单](docs/photo-audit.md) 列出当前所有 id、名称与城市。缺图与图片加载失败均显示城市主题渐变、地点名和类别标签，明确标注为占位，不将生成图或其他景区照片充作实景。

地点可选字段 `photoSource` 记录出处（如 `实拍`、`wikimedia`、`高德`），`photoYear` 记录已知拍摄年份，未知留空或省略。原有 `photoReference`、`photoTakenAt`、作者和许可保留；42 处已知来源与年份已补齐。`npm run photos:check` 输出无图、无出处和疑似老照片三类清单，并单列未知/异常年份。可用 `node scripts/check-photos.mjs --year 2026 --max-age 2 --json` 固定口径；超过两年才提示旧图，当前为如意湖（2019）与云台山（2018），不自动下架。

新增只接受未经编辑改色的真实实拍或明确授权原作。人工上传 JPG 到仓库根目录，在对应 JSON 地点增加 `/assets/文件名.jpg` 的 `image` 引用，重新构建即可显示；公开授权图同时保留作者、许可和原始来源页。完整流程、未知日期处理及全量测试要求见 [人工补图](docs/photo-maintenance.md#人工补图与旧照片更新)。保留既有照片的历史处理说明，不将旧图一概描述为无后期。

2026-10-16 补充濮阳戚城入口（Vitsuha，2024-12-10，CC0 1.0）和商丘古城拱阳门（Yumeto，2025-06-01，CC BY-SA 4.0）两张实拍。采用 Commons 官方普通缩略版，未自行裁剪、改色或重编码；完整来源与处理范围见 [补图记录](docs/photo-expansion.md)。原有 40 张保留。

2026-10-15 补充商丘应天书院山门与开封市博物馆新馆入口 2 张实拍，实景库从 38 增至 40 张。原有照片保持不变，仍有 55 个地点待补实景。采用 Commons 1280px 版本，未修改照片内容；卡片可能裁切，详情与相册保留完整画面。开封市博物馆的暂停推荐标记保留，历史照片不代表当前开放状态。

- 应天书院：Yumeto / Wikimedia Commons · CC BY-SA 4.0 · 拍摄于 2025-06-01。[照片来源](https://commons.wikimedia.org/wiki/File:20250601_Yingtian_Shuyuan.jpg) · [许可](https://creativecommons.org/licenses/by-sa/4.0)
- 开封市博物馆新馆：Windmemories / Wikimedia Commons · CC BY-SA 4.0 · 拍摄于 2024-10-25。[照片来源](https://commons.wikimedia.org/wiki/File:20241025_Kaifeng_Museum_01.jpg) · [许可](https://creativecommons.org/licenses/by-sa/4.0)

2026-10-13 第二轮补充大相国寺山门、济渎庙龙亭与许昌灞陵桥景区红墙拱门 3 张实拍，实景库增至 38 张；地点详情和实景相册可查看。

- 大相国寺：Windmemories / Wikimedia Commons · CC BY-SA 4.0 · 拍摄于 2025-06-22。[照片来源](https://commons.wikimedia.org/wiki/File:20250622_Xiangguo_Temple_01.jpg) · [许可](https://creativecommons.org/licenses/by-sa/4.0)
- 济渎庙：Windmemories / Wikimedia Commons · CC BY-SA 4.0 · 拍摄于 2025-07-16。[照片来源](https://commons.wikimedia.org/wiki/File:20250716_Jidu_Temple_10.jpg) · [许可](https://creativecommons.org/licenses/by-sa/4.0)
- 灞陵桥景区：沈澄心 / Wikimedia Commons · CC0 · 拍摄于 2024-08-12。[照片来源](https://commons.wikimedia.org/wiki/File:Baling_Bridge_Park_20240812_01.jpg) · [许可](https://creativecommons.org/publicdomain/zero/1.0/deed.en)

2026-10-13 补充河南宝泉旅游区实景，照片拍摄于 2026-05-08，画面为辉县宝泉水库及太行红岩峡谷，当时共 35 张。

- 河南宝泉旅游区：Steven Sun / Wikimedia Commons · CC BY-SA 4.0 · 拍摄于 2026-05-08 · 使用公开 1280px 缩略版，未修改照片内容；卡片可能裁切显示。[照片来源](https://commons.wikimedia.org/wiki/File:Baoquan_Reservoir_20260508.jpg) · [许可](https://creativecommons.org/licenses/by-sa/4.0)

2026-10-12 新增 22 张 2024—2026 年实拍，包含应天门、铁塔公园、殷墟博物馆、万仙山、胖东来天使城、神垕古镇、南湾湖与王屋山等。逐张来源、作者与许可见 [本轮补充清单](docs/photo-expansion.md)。洛邑古城现有照片已由用户确认正确，保留原图。

2026-10-11 新增万岁山、老君山、银基动物王国与建业电影小镇，以及首页周末玩法入口。支持地点别名、沉浸演艺与亲子兴趣，老君山的往返栾川与索道时间在行程检查中提示待核算。详见 [目的地补充](docs/weekend-destinations.md)。

- 老君山：Huangdan2060 / Wikimedia Commons · CC BY 4.0 · 拍摄于 2025-03-18 · 使用1280px版本；缩略图裁切显示。[照片来源](https://commons.wikimedia.org/wiki/File:Laojun_Mountain_18_March_2025A.jpg) · [许可](https://creativecommons.org/licenses/by/4.0/)

2026-10-10 更新了五张较旧照片。首页优先展示 2024—2026 年实景，拍摄日期来自原始照片说明，不能视为今日景区状态。云台山和如意湖暂未找到更近期且许可清楚的合适替代图，仍标明原拍摄日期。

- 如意湖：xiquinhosilva / Wikimedia Commons · CC BY 2.0 · 拍摄于 2019-09-14 · 已缩放；缩略图裁切显示。[照片来源](https://commons.wikimedia.org/wiki/File:Ruyi_Lake_25514-Zhengzhou_(49067715743).jpg) · [许可](https://creativecommons.org/licenses/by/2.0/)
- 河南博物院：Nishino Asuka / Wikimedia Commons · CC BY-SA 4.0 · 拍摄于 2024-11-20 · 使用 1280px 版本；缩略图裁切显示。[照片来源](https://commons.wikimedia.org/wiki/File:Henan_Museum_in_November_2024.jpg) · [许可](https://creativecommons.org/licenses/by-sa/4.0/)
- 嵩山少林寺：Windmemories / Wikimedia Commons · CC BY-SA 4.0 · 拍摄于 2024-11-03 · 已缩放与压缩。[照片来源](https://commons.wikimedia.org/wiki/File:20241103_Gate_of_Shaolin_Temple.jpg) · [许可](https://creativecommons.org/licenses/by-sa/4.0/)
- 龙门石窟：Rongcan Lu / Wikimedia Commons · CC0 1.0 · 拍摄于 2025-05-04 · 使用 1280px 版本；缩略图裁切显示。[照片来源](https://commons.wikimedia.org/wiki/File:Lushena_Buddha_statue_in_Longmen_Grottoes,_Luoyang.jpg) · [许可](https://creativecommons.org/publicdomain/zero/1.0/)
- 白马寺：Yumeto / Wikimedia Commons · CC BY-SA 4.0 · 拍摄于 2025-05-29 · 使用 1280px 版本；缩略图裁切显示。[照片来源](https://commons.wikimedia.org/wiki/File:20250529_Dafo_Dian.jpg) · [许可](https://creativecommons.org/licenses/by-sa/4.0/)
- 洛邑古城：Windmemories / Wikimedia Commons · CC BY-SA 4.0 · 拍摄于 2024-12-15 · 已缩放、压缩；缩略图裁切显示。[照片来源](https://commons.wikimedia.org/wiki/File:20241215_Luoyi_Ancient_City.jpg) · [许可](https://creativecommons.org/licenses/by-sa/4.0/)
- 洛阳博物馆：Tim Wu / Wikimedia Commons · CC BY-SA 4.0 · 拍摄于 2024-09-29 · 已缩放、压缩；缩略图裁切显示。[照片来源](https://commons.wikimedia.org/wiki/File:Exterior,_Luoyang_Museum_20240929.jpg) · [许可](https://creativecommons.org/licenses/by-sa/4.0/)
- 龙亭公园：Yumeto / Wikimedia Commons · CC BY-SA 4.0 · 拍摄于 2025-05-31 · 使用 1280px 版本；缩略图裁切显示。[照片来源](https://commons.wikimedia.org/wiki/File:20250531_Long_Ting.jpg) · [许可](https://creativecommons.org/licenses/by-sa/4.0/)
- 清明上河园：Yumeto / Wikimedia Commons · CC BY-SA 4.0 · 拍摄于 2025-05-31 · 使用 1280px 版本；缩略图裁切显示。[照片来源](https://commons.wikimedia.org/wiki/File:20250531_Shangshan_Men.jpg) · [许可](https://creativecommons.org/licenses/by-sa/4.0/)
- 云台山：Gary Todd / Wikimedia Commons · CC0 1.0 · 拍摄于 2018-05-20 · 已缩放与压缩。[照片来源](https://commons.wikimedia.org/wiki/File:2018_Yuntai_Mountain_Red-stone_Gorge_02.jpg) · [许可](https://creativecommons.org/publicdomain/zero/1.0/)
- 红旗渠：Windmemories / Wikimedia Commons · CC BY-SA 4.0 · 拍摄于 2026-08-15 · 已缩放、压缩；缩略图裁切显示。[照片来源](https://commons.wikimedia.org/wiki/File:20260815_Red_Flag_Canal_05.jpg) · [许可](https://creativecommons.org/licenses/by-sa/4.0/)

照片更新流程与此次替换记录见 [照片维护文档](docs/photo-maintenance.md)。

### 旅行氛围与交互

首页使用已核对出处的河南实景、深藏青与青绿玻璃输入层，保留真实五智能体执行和确认后应用。目的地照片卡、滚动入场、实际结果逐段显现与操作微反馈均为原生实现，支持减少动态效果；见[界面维护与改动清单](docs/travel-ui.md)。
