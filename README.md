# 豫见行迹 河南周末游决策助手

河南旅游展示成品，沿用现有高德 JS API 接入。覆盖郑州、洛阳、开封、焦作、安阳、三门峡，内置 22 个精选地点及三条可编辑路线。当前包含 11 张真实照片，附作者、许可与拍摄对象说明。

页面默认进入主题路线展厅，新用户初始草稿为“洛阳 · 两日慢游”，已有账号恢复原草稿。四个视图分别呈现主题路线、地图规划、行程总览和行程检查。用户可以描述周末旅行需求并确认条件，生成候选行程，切换城市、筛选景点、美食和住宿、查看详情和实景照片、修改日期、顺序与停留时间，再导出或导入 JSON 行程。

## 旅行决策与验证

- 需求入口提取城市、天数、交通方式、每日上限、休息、人均预算、主题和明确提及的必去地点；确认后才应用。缺模型时使用文字规则识别，明确显示来源。模型请求只使用目录地点 ID，结构化条件经验证后才能进入规划。
- 候选选点按已确认的城市与主题在精选目录中匹配；分日可由规则或已配置模型提出。只有用户点击替换后才改草稿；新候选将费用重置为待填，保留完成的体验记录。
- 固定某站的日期后，规则与模型输出都必须保留该日期。支持只重排某一天，其他天的地点、顺序和停留时长不变。时长上限是规划目标，不能把算法的软惩罚表述为可行性保证。
- 检查游览加休息与已核算交通的时长、目的地及跨城条件、必去地点缺失，以及用户填写的人均费用。未提供的费用和交通显示未知，不计为已满足；预约、营业时间和无障碍条件尚未核验。
- 交通缓存仅限本次页面，30 分钟后在时间线、地图、总览和检查页统一失效。路线变化后需重新查询。
- 可开始一次体验任务计时，记录编辑操作数、结束时的未确认项、评分与文字反馈，并导出原始 JSON。原先方法用时为用户自行填写，不自动生成效率提升结论。完成的记录与行程一同按账号保存，最近保留 20 条；访客仅保留本页状态，可导出留存。记录尚不构成正式用户研究。

## 展示与数据

深蓝与暖金界面，实景主题路线、六城入口、可编辑地图与分日行程册。行程总览提供打印，并在应用规划后显示实际的调整前后指标。河南全景按城市聚合标记，进入城市后展示地点；高德组件在地图视图可见时才初始化。

“试排洛阳两日”演示将五处地点集中放在第一天，再用规则按每日六小时上限与半小时休息分日。预览不修改原草稿，只有明确载入后才应用，且可以撤销。对照只统计游览与休息，未核算交通不计为零。修改草稿后过时对照自动隐藏。

- 精选资料来自公开文旅信息，每个地点附来源链接。精选坐标是片区展示定位，不用于导航。
- 美食和住宿分类通过高德搜索；高德不可用时保留精选内容，不编造酒店、营业信息或图片。
- 地图状态分别显示加载中、加载完成与加载失败；慢加载仍可恢复，并提供重试按钮。
- 精选详情可跳转到站内高德查询。核算交通时先由用户确认匹配地点或入口；支持驾车、公交和步行，每天 2–9 个点。公交核算限同城，跨城车次另行确认。
- 模型服务不是展示版的必需项。未配置时，规则先按城市和相对位置组织地点，再按每日游览负荷与休息分日。互动示例固定使用规则，不随模型配置变化。
- 核算后时间线累计游览停留、查询时高德站间预计耗时与用户选择的休息预留，并对每日时长上限和跨城行程提示。未获取的交通耗时标记为待核算，景区内部交通、排队和预约仍需另行确认。
- 网站行程按平台认证用户 ID 保存在 D1，刷新后恢复。保存失败保留当前输入并提示重试；并发版本冲突拒绝覆盖。提供撤销、恢复示例及 JSON 导入导出，输出只包含必要字段。历史行程读取成功前暂停编辑，读取失败不会覆盖历史版本。
- 离线文件 `index-offline.html` 嵌入十一张实景照片与全部精选资料，可以断网展示景点详情、路线载入、行程编辑、规则整理和导入导出；离线文件不连接账号保存；高德地图、实时餐饮住宿查询和道路路线需要联网。

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
node scripts/test-decision.mjs
node scripts/test-regressions.mjs
node scripts/test-model-limits.mjs
node scripts/test-edge-cases.mjs
npm run dev
```

`app.html`、`journey.js`、`showcase.js`、`decision.js`、`decision-core.mjs`、三份样式、`server.mjs` 和 `henan.json` 是作者源文件。决策核心在服务端、浏览器与离线版共享。组装脚本插入精选资料、路线和图片，生成自包含 `worker/index.js`；部署入口是 `dist/server/index.js`。D1 绑定为 `DB`，Drizzle 的已生成迁移随构建复制到 `dist/.openai/drizzle`，发布时应用，不在运行时建表。保存 API 只接受平台认证用户身份。

## 服务端配置

- `AMAP_JS_KEY`：浏览器地图 Key。
- `AMAP_SECURITY_JS_CODE`：地图安全密钥，只在服务端使用。
- `LLM_API_KEY`：讯飞 MaaS API管理页的 ak- 开头凭据，保存为服务端 secret。
- `LLM_BASE_URL=https://maas-api.cn-huabei-1.xf-yun.com/v2`；`LLM_MODEL` 填写密钥已开通的模型 ID，如 `spark-x2.5` 或 `spark-x2.5-1.7b`。
- `LLM_MAX_TOKENS=4096`：回复长度请求参数；不代表含思考Token的账单硬上限。
- `LLM_PUBLIC_DEMO=true`：开启有额度限制的公共演示。需要 D1 的 model_usage 表，否则回退规则。
- `STANDALONE_AUTH=true`：独立服务器部署时启用自建账号登录（注册/登录/会话 cookie），替代平台注入的 `oai-authenticated-user-id` 身份；独立模式下客户端提交的该头一律忽略。默认不启用。
- `LLM_DAILY_LIMIT=120`、`LLM_CLIENT_DAILY_LIMIT=10`：按 UTC 日限制调用尝试次数；失败也计数，不重试模型。匿名访问使用服务端IP的加盐哈希，数据库不保留原IP，7天清理。IP缺失时共享额度；不是强账户配额或精确金额上限。

X2.5 请求不发送 response_format、tools 或 thinking_budget。仅对 MaaS 上的 `spark-x2.5-1.7b` 发送 `thinking: {type: "disabled"}`，避免长时间思考耗尽25秒窗口、无法返回最终JSON；该配置已在真实接口验证，其他模型保持原有请求参数。只读取最终 content，进行JSON与业务约束校验。未配置、模型异常、25秒超时、非法结果或额度不足时，HTTP200返回 source=rules 与 fallback.reason（明确请求规则/未配置除外），显示原因。生成候选不会自动修改草稿；用户确认后才应用。固定日期、地点完整性、明确排除和完整数字由程序保护。小数天数会转为待确认；分组金额与千/万单位完整解析；并列否定条件逐项保留。跨游览日城市发生变化时，城际转场仍标记待核算，不把每日内部交通可用误当成全程可行。预算采用整数分求和，避免浮点误差。官方协议：https://www.xfyun.cn/doc/spark/推理服务-http.html

### 本地复现与保存

`npm run build` 自动组装作者文件并打包。修改数据库结构才运行 `npm run db:generate`；已有迁移不得重写。`npm run dev` 仅监听 127.0.0.1:8787，用 Node24 内置 SQLite 按顺序应用迁移，数据库位于未提交的 `.local/travel.sqlite`。默认不连接高德和模型，规则功能可直接验证。若测试账号保存，可向本地 API 请求添加 oai-authenticated-user-id 测试身份；该头只用于本地夹具，线上由平台注入，不能当作自行实现的登录。线上访客只保留当前页草稿，须导出；平台认证用户保存最新行程，页面撤销最多20步，未实现服务器历史版本。

本地如需在线服务，通过终端已有环境变量传入上述配置，勿将真密钥写入源码或示例文件。`node scripts/offline.mjs` 生成可双击的 index-offline.html，只包含规则、精选资料与嵌入图片，不连接道路地图或模型。

地图采用安全代理与固定上游白名单；浏览器不接收地图安全密钥或模型 Key。行程导入、模型返回和地点完整性均校验后使用。

## 实景照片

- 如意湖：xiquinhosilva，CC BY 2.0，已缩放。https://commons.wikimedia.org/wiki/File:Ruyi_Lake_25514-Zhengzhou_(49067715743).jpg
- 龙门石窟奉先寺：Gary Todd，CC0 1.0，已缩放。https://commons.wikimedia.org/wiki/File:Vairocana,_Fengxian_Temple,_Longmen_Grottoes_(10240207654).jpg
- 开封龙亭：Gary Todd，CC0 1.0，已缩放。https://commons.wikimedia.org/wiki/File:Dragon_Pavilion_01.jpg

- 河南博物院：drnan tu，CC BY-SA 2.0，已缩放。https://commons.wikimedia.org/wiki/File:Henan_Museum_pic_1.jpg
- 少林寺山门：Windmemories，CC BY-SA 4.0，已缩放。https://commons.wikimedia.org/wiki/File:20241103_Gate_of_Shaolin_Temple.jpg
- 云台山红石峡：Gary Todd，CC0 1.0，已缩放。https://commons.wikimedia.org/wiki/File:2018_Yuntai_Mountain_Red-stone_Gorge_02.jpg
- 白马寺：A1AA1A，CC0 1.0，已缩放。https://commons.wikimedia.org/wiki/File:%E7%99%BD%E9%A9%AC%E5%AF%BA-White_Horse_Temple.jpg

- 清明上河园：Gary Todd，CC0 1.0，已缩放压缩。https://commons.wikimedia.org/wiki/File:2014_Millennium_City_Park_Towers_and_Lake.jpg
- 洛邑古城：Windmemories，CC BY-SA 4.0，已缩放压缩。https://commons.wikimedia.org/wiki/File:20241215_Luoyi_Ancient_City.jpg
- 洛阳博物馆：Tim Wu，CC BY-SA 4.0，已缩放压缩。https://commons.wikimedia.org/wiki/File:Exterior,_Luoyang_Museum_20240929.jpg
- 红旗渠青年洞：Windmemories，CC BY-SA 4.0，已缩放压缩。https://commons.wikimedia.org/wiki/File:20260815_Red_Flag_Canal_05.jpg
