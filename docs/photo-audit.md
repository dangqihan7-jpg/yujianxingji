# 地点照片审计与补图清单

审计日期：2026-10-16。当前 henan.json 含 95 个地点：42 处有本地实景照片，53 处没有 image。本轮新增戚城与商丘古城，保留原有 40 张；来源、作者、许可、拍摄日期和下载哈希见照片记录及补图说明。

保留现有来源与年份信息；photoYear 取自拍摄日期，未知不按上传或维护日期推测。新增两图直接使用 Commons 官方普通缩略版，不自行裁剪或改色；既有照片历史处理说明保留，不声称全部原作完全无后期。

## 无图地点（53）

| id | 名称 | 城市 |
|---|---|---|
| hn-only-henan | 只有河南·戏剧幻城 | 郑州 |
| hn-xigong | 西工小街 | 洛阳 |
| hn-kaifeng-fu | 开封府 | 开封 |
| hn-chenjiagou | 陈家沟 | 焦作 |
| hn-dikeng | 陕州地坑院 | 三门峡 |
| hn-guoguo | 虢国博物馆 | 三门峡 |
| hn-swanlake | 天鹅湖国家城市湿地公园 | 三门峡 |
| hn-wansui | 万岁山武侠城 | 开封 |
| hn-yinji | 银基动物王国 | 郑州 |
| hn-movie-town | 建业电影小镇 | 郑州 |
| hn-fangte | 郑州方特欢乐世界 | 郑州 |
| hn-mingtang | 隋唐洛阳城明堂天堂景区 | 洛阳 |
| hn-jiguandong | 鸡冠洞 | 洛阳 |
| hn-chongdugou | 重渡沟 | 洛阳 |
| hn-gulou | 鼓楼夜市 | 开封 |
| hn-qingtian | 青天河 | 焦作 |
| hn-shennong | 神农山 | 焦作 |
| hn-dananpo | 大南坡村 | 焦作 |
| hn-taihang-canyon | 太行大峡谷 | 安阳 |
| hn-hangu | 函谷关历史文化旅游区 | 三门峡 |
| hn-miaodigou | 庙底沟博物馆 | 三门峡 |
| hn-yuxi-canyon | 豫西大峡谷 | 三门峡 |
| hn-yaoshan | 尧山 | 平顶山 |
| hn-erlangshan | 二郎山 | 平顶山 |
| hn-baigui | 白龟湖国家城市湿地公园 | 平顶山 |
| hn-yunmeng | 云梦山 | 鹤壁 |
| hn-guling | 古灵山 | 鹤壁 |
| hn-baligou | 八里沟 | 新乡 |
| hn-pushang | 濮上园 | 濮阳 |
| hn-dongbeizhuang | 东北庄杂技文化旅游区 | 濮阳 |
| hn-puyang-longhu | 濮阳龙湖 | 濮阳 |
| hn-caowei | 曹魏古城 | 许昌 |
| hn-shali | 沙澧河风景区 | 漯河 |
| hn-xushen | 许慎文化园 | 漯河 |
| hn-birdpark | 神州鸟园 | 漯河 |
| hn-luowan | 漯湾古镇 | 漯河 |
| hn-neixiang | 内乡县衙博物馆 | 南阳 |
| hn-laojieling | 老界岭 | 南阳 |
| hn-dinosaur | 西峡恐龙遗迹园 | 南阳 |
| hn-riyuehu | 商丘日月湖 | 商丘 |
| hn-jigongshan | 鸡公山 | 信阳 |
| hn-haotang | 郝堂村 | 信阳 |
| hn-wenxin | 文新茶村 | 信阳 |
| hn-xingxiuchuan | 星宿川沙滩营地 | 信阳 |
| hn-laozi | 老子故里旅游区 | 周口 |
| hn-zhoukou-zoo | 周口野生动物世界 | 周口 |
| hn-huaiyang-longhu | 淮阳龙湖 | 周口 |
| hn-chayashan | 嵖岈山 | 驻马店 |
| hn-royal-post | 皇家驿站 | 驻马店 |
| hn-laoleshan | 老乐山 | 驻马店 |
| hn-nanhai | 南海禅寺 | 驻马店 |
| hn-wulongkou | 五龙口 | 济源 |
| hn-huanghe-three | 黄河三峡 | 济源 |

无图卡片与图片加载失败均显示城市主题渐变、地点大字和类别标签，并明确标示“实景待补 · 照片占位”或“加载失败 · 照片占位”。这是图形占位，不是景区照片；点击地点详情、选点等原有功能继续可用。正常加载的实景照片沿用原文件。

## 批量检查

```sh
npm run photos:check
node scripts/check-photos.mjs --year 2026 --max-age 2
node scripts/check-photos.mjs --year 2026 --max-age 2 --json
node scripts/check-photos.mjs --file /path/to/places.json --year 2026 --json
```

默认读取脚本所在仓库的 `henan.json`；`--file` 也接受含 `places` 的 JSON 或地点数组。脚本只读数据，不下载照片、不调用模型、不改写 JSON。`--json` 输出可供后续人工分批处理的结构化清单。

三类主清单分别是“无图”“无出处（仅有图地点）”“疑似老照片”。缺图地点不重复算作无出处或未知年份。只有平台名不代表可追溯来源：照片应保留 `photoReference` 原始页链接；自有实拍可以用 `photoSource: "实拍"` 配合 `photoAuthor` / `credit`。普通景区介绍 `reference` 不自动当作图片来源。脚本不代替人工核对地点、照片内容、授权和文件加载。

默认按运行当年的年份、`--max-age 2` 检查，**超过**两年才列为疑似旧图；2026 年对应 `photoYear < 2024`，所以 2024 年照片不会被一概列旧。`photoYear` 为空时兼容原有 `photoTakenAt`；两者都未知时单列“年份未知”，未来年份、格式错误和两字段冲突单列“年份异常”。以上都是人工复核提示，不自动下架照片，也不把旧照片称作实时画面。

当前输出节选：

```text
照片审计：2026 年；疑似老照片阈值为超过 2 年（拍摄年份 < 2024）。
总地点 95；有图 42；无图 53。

无图（53）
- hn-only-henan | 只有河南·戏剧幻城 | 郑州
- hn-xigong | 西工小街 | 洛阳
……其余地点见上表或完整命令输出……

无出处（仅有图地点）（0）
- 无

疑似老照片（2）
- hn-ruyi | 如意湖 | 郑州 | 2019 年（相差 7 年）
- hn-yuntai | 云台山 | 焦作 | 2018 年（相差 8 年）

附：年份未知（仅有图地点）（0）
- 无

附：年份异常（仅有图地点）（0）
- 无
```

本页是本次审计快照；后续新增照片后以脚本输出为准。补图操作和授权核对见 [照片维护](photo-maintenance.md#人工补图与旧照片更新)。
