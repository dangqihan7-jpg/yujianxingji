# 实景照片维护

## 2026-10-10 替换记录

逐张查看候选照片，核对原始文件说明、地点分类、作者、使用许可与拍摄日期。采用 Wikimedia 提供的 1280px 版本；页面缩略图与首屏可能裁切显示，详情保留完整画面。

| 地点 | 新照片拍摄日期 | 画面 | 作者与许可 | 原始照片 |
|---|---|---|---|---|
| 龙门石窟 | 2025-05-04 | 奉先寺卢舍那大佛与崖壁雕刻 | Rongcan Lu，CC0 1.0 | [来源](https://commons.wikimedia.org/wiki/File:Lushena_Buddha_statue_in_Longmen_Grottoes,_Luoyang.jpg) |
| 清明上河园 | 2025-05-31 | 上善门夜景与龙形灯饰 | Yumeto，CC BY-SA 4.0 | [来源](https://commons.wikimedia.org/wiki/File:20250531_Shangshan_Men.jpg) |
| 白马寺 | 2025-05-29 | 大佛殿前院落与香炉 | Yumeto，CC BY-SA 4.0 | [来源](https://commons.wikimedia.org/wiki/File:20250529_Dafo_Dian.jpg) |
| 龙亭公园 | 2025-05-31 | 龙亭大殿与台阶 | Yumeto，CC BY-SA 4.0 | [来源](https://commons.wikimedia.org/wiki/File:20250531_Long_Ting.jpg) |
| 河南博物院 | 2024-11-20 | 主建筑与院名外墙 | Nishino Asuka，CC BY-SA 4.0 | [来源](https://commons.wikimedia.org/wiki/File:Henan_Museum_in_November_2024.jpg) |

河南博物院日期采用来源页 Summary 的 2024-11-20；其 EXIF/隐藏分类另有 2024-11-21，存在一天差异，不能当成经过独立验证的精确拍摄时间。所有日期均为作者提供的记录。

首页照片组调整为清明上河园、龙门石窟、洛邑古城、河南博物院、红旗渠，均为 2024—2026 年照片。首页同步显示地点与拍摄日期。云台山保留 2018-05-20 照片，如意湖保留 2019-09-14 照片，本轮未找到更近期且许可清楚的合适替代图；它们仍可在景点资料和相关路线中查看。

## 后续更新规则

优先选择近两年、能核实具体地点的真实照片；同时核对清晰度、构图和明确的使用许可。拍摄时间与上传、网页编辑时间分开记录，不将旧照片称为实时画面。找不到合适新图时保留可确认的旧图并报告日期；高德搜索图片另有来源，不能声称全部经过人工核对。

1. 在仓库根目录替换对应 JPG，更新 `henan.json` 中 `photoReference`、`licenseUrl`、`credit`、`photoCaption` 和 `photoTakenAt`。
2. 图片 URL 的 `v` 参数使用文件 SHA-256 前 12 位，替换后同时更新引用该照片的路线 URL，避免浏览器继续读取旧缓存。根目录文件名保持稳定，旧 URL 仍可访问。
3. 更新 README 的照片来源列表；CC BY-SA 图片继续按相同许可提供。未经授权的图片、生成的仿真景点图不加入实景库。
4. 执行构建、校验、离线生成与测试，检查手机/电脑首屏、详情来源链接、图片加载和页面溢出，再同步 GitHub 并备份部署。

当前每周一 10:00 的 Codex 维护任务负责检查与择图；网站服务本身未实现自动抓图。只有通过核对的新照片才会发布。
