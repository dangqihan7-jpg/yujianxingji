# 智能体数量、名称与顺序核验报告

核验日期：2026-10-23（北京时间）。基线：`fcd75ac9fd065ab1a8df2b3f9410bdc3c717fc6c`（已执行 `git fetch origin`，并另行 fetch GitHub main 确认相同版本）。行号指该基线；本次修改不增减原文件行数。

## 标准口径

**5 个智能体，固定顺序：需求理解 → 地点推荐 → 日程编排 → 交通核算 → 冲突校验。**

“5 个智能体”指阶段数量，不等于 5 次模型调用，也不保证每一步均由模型成功完成。`AI 生成 / 规则回退 / 已确认条件` 的原有来源标注与执行行为保留。

## 核验结论

- 基线 `docs/` 全部15个 Markdown、根目录 README/HANDOFF、materials/README 以及前端文案均已核对。新增本报告后 `docs/` 为16个 Markdown。
- 未发现正文或前端把当前架构明确称为“四个智能体 / 4 个智能体 / 四智能体 / 4 智能体”。没有把正确的五智能体描述虚报成旧错误。
- README、架构文档、首页说明和首页五张卡片原先的完整名称顺序已经正确。本次补强数量及顺序的显式表达，交接文档补全标准名单。
- 发现源文件注释仍用“感知→决策→校验→交付”的四环节概括，及规则辅助入口使用旧概括。本次只改注释，明确五阶段与辅助函数边界，不声称单个辅助函数完成全部五阶段。
- 候选结果的用户可见总结使用“选点、编排、交通状态与冲突检查”等简称，本次换成标准名称顺序；保持来源信息、条件分支、接口结构与规划行为不变。
- 没有重命名函数、改模型提示词、接口、数据、样式、算法、配额或测试逻辑；`worker/index.js` 由构建同步文案和注释，不手改。

## 搜索方式与范围

对 Git 跟踪的文本作全仓搜索；覆盖“四/4/４ + 个/位/种/类/大/名 + AI + 智能体”、英文 four-agent/fourAgent，以及“四阶段/四步”、阶段名称和“感知/决策/校验/交付”等近似概括。每个命中按上下文区分：当前流水线、局部功能、模型调用数、测试否定断言、代码标识与历史叙述。`node_modules`、`.git`、构建目录及未跟踪文件不作为仓库正文；锁文件不是文案，不展开列入。

下列清单是实际检查的文件；命中行含单个功能名称（如“交通核算”），不表示这些行都存在智能体口径错误。`—` 表示无相关关键词。新增报告自引的搜索词、旧文引用不作为残留问题。

### Markdown 文档（基线18份）

| 文件 | 相关命中行 |
| --- | --- |
| `HANDOFF.md` | 26,43,53 |
| `README.md` | 3,23,94,96,98,100,153 |
| `docs/agent-architecture.md` | 1,3,7,47,59 |
| `docs/ai-homepage.md` | 9 |
| `docs/ask-spark-verification.md` | — |
| `docs/ask.md` | 3 |
| `docs/deployment.md` | 27,89,91 |
| `docs/mobile-audit.md` | 9,26,28 |
| `docs/photo-audit.md` | — |
| `docs/photo-expansion.md` | — |
| `docs/photo-maintenance.md` | — |
| `docs/province-coverage.md` | 43 |
| `docs/share.md` | — |
| `docs/travel-ui.md` | 7,23 |
| `docs/ui-design.md` | — |
| `docs/vision.md` | — |
| `docs/weekend-destinations.md` | — |
| `materials/README.md` | — |

### 前端及根目录运行源文件

| 文件 | 相关命中行 |
| --- | --- |
| `ai-hero.css` | — |
| `ai-hero.js` | 9,10,11,12,13,20,63,69 |
| `app.html` | 13 |
| `ask-service.mjs` | — |
| `ask.css` | — |
| `ask.js` | — |
| `decision-core.mjs` | 97,98,99,110,114,115,116,117,120,121,125,137,146,152 |
| `decision.css` | — |
| `decision.js` | 7,16,21,22,23,24,30,55,58,69,84,86,87,101,105,106,130,139,155,158,160,164 |
| `hero-photos.mjs` | — |
| `journey.js` | — |
| `photo-media.js` | — |
| `server.mjs` | 161,317,318,319,341,346,350,357,393,401,405,421,422,423,432,434,444,445,446,451,452,456,459,461,462,466,467,473,475,478,480,481,485,488,490,491,504,509,512,513,514,515,517,518,526,530,531,532,545,559,562 |
| `share-timeline.mjs` | — |
| `share.css` | — |
| `share.js` | — |
| `showcase.css` | — |
| `showcase.js` | 237,242,247 |
| `styles.css` | — |
| `travel-agent.mjs` | 1,5,24,25,26,29,33,35,36,44,45,47,48,49,50,52 |
| `travel-motion.js` | — |
| `travel-theme.css` | — |
| `ui.css` | — |
| `vision-service.mjs` | — |
| `vision.css` | — |
| `vision.js` | — |

### 全仓补充文本扫描（脚本、配置、数据与证据）

| 文件 | 相关命中行 |
| --- | --- |
| `.env.example` | — |
| `.gitignore` | — |
| `.openai/hosting.json` | — |
| `competition-evidence/clean-rebuild.json` | — |
| `competition-evidence/edge-case-results.json` | — |
| `competition-evidence/final-test-runs.json` | — |
| `competition-evidence/live-checks.json` | — |
| `competition-evidence/local-http-smoke.json` | — |
| `competition-evidence/public-quota-results.json` | — |
| `competition-evidence/regression-results.json` | — |
| `competition-evidence/secret-scan.json` | — |
| `competition-evidence/source-manifest.json` | — |
| `competition-evidence/v10-edge-before.json` | — |
| `db/schema.ts` | — |
| `deploy/aliyun/certbot-renew.service` | — |
| `deploy/aliyun/certbot-renew.timer` | — |
| `deploy/aliyun/nginx.conf` | — |
| `deploy/aliyun/reload-nginx.sh` | — |
| `docs/photo-catalog.json` | — |
| `drizzle.config.ts` | — |
| `drizzle/0000_smiling_sphinx.sql` | — |
| `drizzle/0001_brainy_ben_urich.sql` | — |
| `drizzle/0002_charming_hydra.sql` | — |
| `drizzle/0003_bright_falcon.sql` | — |
| `drizzle/0004_trip_shares.sql` | — |
| `drizzle/meta/0000_snapshot.json` | — |
| `drizzle/meta/0001_snapshot.json` | — |
| `drizzle/meta/0002_snapshot.json` | — |
| `drizzle/meta/0003_snapshot.json` | — |
| `drizzle/meta/0004_snapshot.json` | — |
| `drizzle/meta/_journal.json` | — |
| `evidence/clean-rebuild.json` | — |
| `evidence/edge-case-results.json` | — |
| `evidence/final-test-runs.json` | — |
| `evidence/live-checks.json` | — |
| `evidence/local-http-smoke.json` | — |
| `evidence/public-quota-results.json` | — |
| `evidence/regression-results.json` | — |
| `evidence/secret-scan.json` | — |
| `evidence/source-manifest.json` | — |
| `evidence/v10-edge-before.json` | — |
| `henan.json` | 1057 |
| `materials/视频讲解与分镜.txt` | — |
| `materials/豫见行迹_项目演示.srt` | — |
| `package.json` | — |
| `scripts/assemble.py` | — |
| `scripts/build.sh` | — |
| `scripts/bundle-qrcode.mjs` | — |
| `scripts/check-photos.mjs` | — |
| `scripts/deploy-aliyun.sh` | — |
| `scripts/dev.mjs` | — |
| `scripts/http-response.mjs` | — |
| `scripts/offline.mjs` | — |
| `scripts/test-agent-replay.mjs` | 47,184,186,192,203,204,209,308 |
| `scripts/test-agent.mjs` | 5,6,10,24,33,37,49,54,64,79,80,81,82,86,93,98,101,117,122,123,126,130,133,138,144,148,150,166,183,207,247,268,279 |
| `scripts/test-ai-hero.mjs` | 27,29 |
| `scripts/test-ask-ui.mjs` | — |
| `scripts/test-ask.mjs` | 31 |
| `scripts/test-auth.mjs` | — |
| `scripts/test-check-photos.mjs` | — |
| `scripts/test-decision.mjs` | — |
| `scripts/test-edge-cases.mjs` | — |
| `scripts/test-hero-photos.mjs` | — |
| `scripts/test-http-stream.mjs` | — |
| `scripts/test-journey.mjs` | — |
| `scripts/test-js-api.mjs` | — |
| `scripts/test-map-loader.mjs` | — |
| `scripts/test-mobile-export.mjs` | — |
| `scripts/test-model-limits.mjs` | — |
| `scripts/test-offline.mjs` | — |
| `scripts/test-photo-media.mjs` | — |
| `scripts/test-province.mjs` | — |
| `scripts/test-regressions.mjs` | — |
| `scripts/test-share-ui.mjs` | — |
| `scripts/test-share.mjs` | — |
| `scripts/test-showcase.mjs` | — |
| `scripts/test-travel-hero.mjs` | — |
| `scripts/test-travel-motion.mjs` | 136,141 |
| `scripts/test-vision-ui.mjs` | — |
| `scripts/test-vision.mjs` | — |
| `scripts/test.mjs` | — |
| `scripts/validate-artifact.mjs` | — |
| `worker/index.js` | 1,2,102,103,104,115,119,120,121,122,125,126,130,142,151,157,160,164,183,184,185,188,192,194,195,203,204,206,207,208,209,211,696,852,853,854,876,881,885,892,928,936,940,956,957,958,967,969,979,980,981,986,987,991,994,996,997,1001,1002,1008,1010,1013,1015,1016,1020,1023,1025,1026,1039,1044,1047,1048,1049,1050,1052,1053,1061,1065,1066,1067,1080,1094,1097 |
| `wrangler.jsonc` | — |

### 比赛材料的辅助文字检查

额外只读提取以下文件的 DOCX/PPTX XML 文字，未命中智能体数量或完整名单；没有修改文件：

- `materials/豫见行迹_项目介绍_可编辑.pptx`
- `materials/豫见行迹_项目审查与改进意见.docx`
- `materials/豫见行迹_项目测试说明.docx`
- `materials/豫见行迹_项目策划书.docx`
- `materials/豫见行迹_项目部署说明.docx`

`materials/视频讲解与分镜.txt` 与 `materials/豫见行迹_项目演示.srt` 已按文本核对（见清单），没有智能体数量或名单。两份 PDF 预览和 MP4 不在本次指定的 Markdown/前端文案范围内，未做 PDF 视觉或视频逐帧核验；本报告不代表录屏画面或图片内文字已全部审核。

## 修改前后逐项对照

### 1. `README.md:3`

修改前：

```text
以 AI 智能体为核心的河南周末游决策助手
```

修改后：

```text
以 5 个智能体协同为核心的河南周末游决策助手
```

### 2. `README.md:96`

修改前：

```text
主入口是 `POST /api/agent`，执行需求理解→地点推荐→日程编排→交通核算→冲突校验五阶段流水线，各阶段独立回退并如实标注来源。
```

修改后：

```text
主入口是 `POST /api/agent`，由 5 个智能体按固定顺序执行：需求理解 → 地点推荐 → 日程编排 → 交通核算 → 冲突校验。各阶段独立回退并如实标注来源。
```

### 3. `HANDOFF.md:26`

修改前：

```text
主规划入口使用 `/api/agent`，由模型选择景点、决定工具调用与分日安排；
```

修改后：

```text
主规划入口使用 `/api/agent`，固定为 5 个智能体，名称与顺序为：需求理解 → 地点推荐 → 日程编排 → 交通核算 → 冲突校验。由模型选择景点、决定工具调用与分日安排；
```

### 4. `docs/agent-architecture.md:3`

修改前：

```text
在线候选使用 `POST /api/agent` 的五阶段顺序流水线：
```

修改后：

```text
在线候选使用 `POST /api/agent` 的 5 个智能体，按固定顺序执行：
```

### 5. `docs/ai-homepage.md:9`

修改前：

```text
展示五个角色：需求理解、地点推荐、日程编排、交通核算、冲突校验。
```

修改后：

```text
展示 5 个智能体，名称与顺序为：需求理解 → 地点推荐 → 日程编排 → 交通核算 → 冲突校验。
```

### 6. `server.mjs:317`

修改前：

```text
// ---------- 智能体直接规划：感知→决策→校验→交付 ----------
// 感知复用 perceiveIntent；决策（城市、天数、选点、取舍）由模型或规则智能体做出；
// 校验复用 rulePlan 分日与 auditDecision 审计；每条决策都给出依据。
```

修改后：

```text
// ---------- 5 个智能体：需求理解 → 地点推荐 → 日程编排 → 交通核算 → 冲突校验 ----------
// 需求理解复用 perceiveIntent；地点推荐与日程编排由模型或明确标注的规则完成；
// 交通核算保留未知项，冲突校验结合 auditDecision；每条决策都给出依据。
```

### 7. `server.mjs:545`

修改前：

```text
本次由规则完成需求理解、选点、编排、交通状态与冲突检查；
```

修改后：

```text
本次规则候选按需求理解 → 地点推荐 → 日程编排 → 交通核算 → 冲突校验流程生成；
```

### 8. `decision-core.mjs:97`

修改前：

```text
// ---------- 智能体直接规划：感知→决策→校验→交付 ----------
// 与“条件提取→人工确认→候选→人工确认”不同：智能体替用户做出全部行程决策
// （城市、天数、每天时长、休息、出行方式、选点、分日、取舍），用户只做最终拍板。
```

修改后：

```text
// ---------- 5 个智能体的规则辅助：需求理解 → 地点推荐 → 日程编排 → 交通核算 → 冲突校验 ----------
// 本节提供需求理解与地点推荐的规则辅助，供上层五阶段流水线调用。
// 日程编排、交通核算与冲突校验由调用方完成；这些辅助函数不单独代表完整智能体执行。
```

### 9. `decision-core.mjs:146`

修改前：

```text
// 规则智能体：完整的一次 感知→决策（分日复用 rulePlan 由调用方完成）→交付。
```

修改后：

```text
// 规则辅助入口：需求理解与地点推荐；日程编排复用 rulePlan，交通核算与冲突校验由上层流水线完成。
```

### 生成文件

`worker/index.js` 由 `npm run build` 重新生成，同步上述 `decision-core.mjs` 的注释（包括内嵌前端副本）、`server.mjs` 的注释和一条用户可见总结。它不是新增逻辑修改点。

## 已正确、无需替换的关键前端位置

| 位置 | 原有内容及结论 |
| --- | --- |
| `ai-hero.js:9–13` | 五张能力卡，依次为需求理解、地点推荐、日程编排、交通核算、冲突校验，正确。 |
| `ai-hero.js:63,69` | “5 个 AI 智能体协同”和“5 个智能体的能力”，完整顺序正确。 |
| `decision.js:21–23` | 五智能体来源标签，正确。 |
| `decision.js:86,160` | N/5 实时计数、5/5终态及完整五阶段顺序，正确。 |
| `app.html` | 智能体首屏、候选文案由上述作者文件注入，没有另一个四智能体列表。 |
| `travel-agent.mjs:1,33–52` | 注释与规则流程实际执行的名称、数量、顺序正确。 |

## 历史记述类未改项（供确认）

**无。** 本次范围内未发现“最初是4个”“曾采用四智能体”等明确回顾数量的历史叙述，因此没有需要确认后再改写的历史段落。旧注释只描述当时所谓当前流程，未标为历史，已按现行标准澄清。历史演示案例与录制事实保持原文。

## 其他保留命中与排除误报

| 位置 | 原文/命中 | 保留原因 |
| --- | --- | --- |
| `server.mjs:446,562`（生成 Worker 中有对应副本） | `fourAgentPlan` | 内部函数名及调用；实际执行五个阶段，不是用户文案。按不改代码逻辑的要求保留，不将其误报为“四智能体现行架构”。 |
| `scripts/test-agent-replay.mjs:209` | `assert(!preview.innerHTML.includes('四智能体'))` | 负向断言，防止旧文案出现，不能替换成禁止“五智能体”。 |
| `scripts/test-agent.mjs:109` | “已确认条件不是规则回退；其余四步全 AI 时整体来源仍为 AI。” | 一个已确认阶段加四个 AI 阶段，合计仍为五，不是四智能体架构。 |
| `scripts/offline.mjs:18` | `modelCalls:4` | 模型调用额度，与智能体数量不同，不改数值。 |
| `server.mjs:341` 与 `scripts/test-agent.mjs:82` | “你是行程规划智能体” / 对应上游 mock 路由 | 单个模型执行提示词及测试匹配，不是完整智能体名单或前端阶段标签；本次不调整提示词语义或测试逻辑。 |
| `README.md:13,70`、`docs/ui-design.md:26`、`docs/province-coverage.md:11` | 四个视图、四份样式、每城四个地点 | 均非智能体数量，不修改。 |

## 验证与提交边界

- `npm run build`：通过；临时副本重建的 `worker/index.js` 与工作区构建结果哈希一致。
- `npm run validate`：通过。
- `npm test`：28个套件全部通过，包含智能体接口/回放、首页、问答等既有回归；不新增镜像实现的测试。
- 运行源文件不变检查：去除本次整行注释差异，并还原已列明的候选总结文案后，`server.mjs` 与 `decision-core.mjs` 均与基线逐字一致；无新增分支或函数改名。
- 全量测试在独立临时副本运行。对本工作区及原 `ui-redesign` 工作区所有 `competition-evidence/*.json` 做运行前后 SHA-256 比对，全部保持不变，且本提交不含该目录。
- 本次只改7个既有文件（README、HANDOFF、两份文档、两个源文件及生成 Worker），新增本核验报告，共8个文件；前端展示文件本身已正确，无需替换。
- 没有调用真实模型、修改账号/配置或部署服务器；按本任务以一个中文提交交付。
