# 公开只读行程分享

在“导出行程图”旁点击“分享行程”，创建30天有效的快照。弹窗提供链接、复制按钮和本地生成的二维码；链接由 `location.origin + '/s/' + token` 组成，不固定域名。任何取得链接的人都能查看快照，无需登录。原行程后续修改不影响已有快照。

## 接口与数据

`POST /api/share` 无需登录，接收和海报接口相同的地点名称列表与天数，另加分日数组：

```json
{
  "places": ["龙门石窟", "洛邑古城"],
  "days": 2,
  "schedule": [
    {"day": 1, "stops": [
      {"name": "龙门石窟", "city": "洛阳", "duration": 180, "travelMinutes": null},
      {"name": "洛邑古城", "city": "洛阳", "duration": 90, "travelMinutes": null}
    ]},
    {"day": 2, "stops": []}
  ]
}
```

返回 `{"token":"8位URL安全字符"}`（实际 token 使用随机字符，不使用该示例文字）。天数1–7、最多15站，每站停留15–720分钟；分日必须完整，地点清单与分日一致。`travelMinutes` 为到达当前站的已核算站间交通分钟，未知为null，不补造。允许同名但不同城市或日期的安排。后端只保存白名单中的公开字段；`user`、账号ID、Cookie、原草稿、坐标、预算和体验记录等不会写入分享JSON。

`GET /api/share/:token` 公开返回保存的JSON。`GET /s/:token` 返回服务器渲染的只读HTML，复用导出行程图的分日时间线数据与科技风视觉：DAY、发光节点、站点卡片。页面没有脚本、编辑控件、AI或账号请求；底部“我也要规划”返回首页。375px与桌面均可阅读。

无效、不存在或过期的token，两条读取路径都返回HTTP404和中文HTML“该分享已过期或不存在”，附回首页按钮。存储未配置或故障返回503的友好HTML，避免误称链接已过期。HTML设置no-store、no-referrer及限制脚本/资源的CSP，地点和城市文本均转义。

## 存储与限流

新增迁移 `drizzle/0004_trip_shares.sql`：

```sql
CREATE TABLE shares (
  token TEXT PRIMARY KEY NOT NULL,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
```

时间以Unix毫秒存储。token由 `crypto.getRandomValues` 产生6字节，再转为8位base64url字符；唯一冲突重试，不覆盖已有快照。读取条件 `expires_at > Date.now()`，到期即不可访问，暂不定期清理。

复用 `model_usage` 的UPSERT限流模式，独立 `share:client:<hash>` 和 `share:global` scope，按UTC日计数：匿名3次、登录10次、全局100次。超限返回429 JSON和中文提示，不插入新分享。独立部署优先使用Nginx覆盖的X-Real-IP作为匿名标识；数据库仅保存标识哈希。与模型、海报计数分开，不调用AI，也不修改 `/api/poster`。

无需新密钥或新环境变量，只需已有DB绑定。Drizzle schema同时补回已有flow_stats声明，并修复0003快照的prevId链，避免生成新迁移时误删旧表；旧SQL迁移未修改，新SQL仅创建shares。

## 构建与部署

执行 `npm ci --ignore-scripts --no-audit --no-fund`、`npm run build`、`npm run validate`、`npm test`。二维码使用固定版本 `qrcode@1.5.4` 的浏览器入口，本地构建脚本只打包qrcode与dijkstrajs的28个模块（约80KB未压缩），保留MIT许可，不包含CLI、Node兼容层、CDN或外部二维码接口。产物缓存位于node_modules，完整Worker内嵌产物，缓存与node_modules不提交。

独立Node入口启动时依次应用迁移；Worker/D1部署先应用0004迁移再切换版本。发布前备份源代码、SQLite与私密配置，保留 `.local` 数据链接和原账号行程。分享功能只新增shares表，原账号/行程表不变。

## 验证

完整 `npm test` 含20组套件，新增 `test-share`（17项真实SQLite检查）与 `test-share-ui`。覆盖创建/公开读取、深层隐私过滤、精确30天期限及404、匿名/登录/全局限流与并发、token碰撞、不重复同名POI、输入校验、故障存储、SSR转义，以及海报接口逐字不变；前端覆盖快照、复制/二维码、取消/迟到、重复点击、缓存、剪贴板失败和离线/限流错误。

浏览器使用隔离的真实SQLite和本地构建，不配置真实密钥。检查二维码实际解码、剪贴板、375px/桌面、独立未登录窗口、SQL手动过期、匿名第4次429不新增分享。分享页不得请求模型、账号、草稿或外部资源。
