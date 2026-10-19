# 独立部署与配置

## 本地
Node.js 24+、Python 3。执行 npm ci、npm run build、npm run validate、npm test、npm run dev。入口 http://127.0.0.1:8787。复制 .env.example 到 .env 后填入自己的值，可用 node --env-file=.env scripts/dev.mjs 加载文件。空配置可以运行规则模式。

## Worker
wrangler.jsonc 是新部署模板，原项目使用 Sites 托管，没有原生 Wrangler 配置。先构建，再使用 Wrangler 创建 D1 数据库，将返回的 database_id 替换全零占位值。执行 D1 migrations apply（database_name 为 yujianxingji，migrations_dir 为 drizzle）。用 Wrangler secret put 配置高德与模型变量，再执行 Wrangler deploy。本次未执行外部部署。

## 身份
平台模式依赖 Sites dispatcher 注入 oai-authenticated-user-id；使用此模式的网关必须验证身份，不能信任客户端提交的该头。阿里云独立部署启用下述 STANDALONE_AUTH 自建账号，不使用平台身份头。公开模型演示须有可用数据库及 model_usage 表和额度限制。环境变量示例只有空值，默认不开启。

### 自建账号（STANDALONE_AUTH=true）
独立服务器部署时，将 `STANDALONE_AUTH` 设为 `true`，启用自建账号登录：
- 接口：`POST /api/auth/register`（用户名 3–32 字符、密码 8–72 字符）、`POST /api/auth/login`、`POST /api/auth/logout`、`GET /api/auth/me`。
- 密码使用 PBKDF2-SHA256（120000 次迭代）加盐哈希存储，服务端不保留明文。
- 登录成功后签发 30 天有效的 HttpOnly 会话 cookie（`travel_session`，SameSite=Lax，HTTPS 下自动加 Secure）。
- 独立模式下客户端提交的 `oai-authenticated-user-id` 头一律忽略，身份只认会话；行程草稿与模型演示额度按账号隔离。
- 数据库新增 `users`、`sessions` 表（迁移 `drizzle/0002_charming_hydra.sql`）；本地 `npm run dev` 按顺序自动应用。
- 未启用时（默认）保持原平台注入身份行为，`/api/auth/*` 返回 404。
- 前端在独立模式下显示登录/注册入口；登录前在本页编辑的行程会在登录后自动载入并保存到账号。

## 服务配置
AMAP_JS_KEY 为浏览器 Key；AMAP_SECURITY_JS_CODE、AMAP_WEB_SERVICE_KEY 留在后端。LLM_API_KEY、LLM_BASE_URL、LLM_MODEL 配置模型接口。真实上游服务与国内访问效果需要在目标部署环境重新验证。

### 当前行程问答

`POST /api/ask` 复用已有 `LLM_API_KEY`、`LLM_BASE_URL`、`LLM_MODEL`，不增加 `.env` 字段或问答专用密钥。服务端需配置MaaS HTTPS `/v2` 基础地址和有权限的 X2.5 系列ModelID，浏览器只发送当前问题与最小行程快照。问答不进入五智能体流水线，不改变现有规划、海报、分享或识图接口。轻量适配遵循[讯飞官方X2.5协议](https://www.xfyun.cn/doc/spark/Spark-X2.5.html)，关闭思考并限制最终回答长度。

需要已有 `model_usage` 表，使用独立 `ask:` scope，按UTC日匿名10次、登录30次、全局200次，无需新迁移。未配置或额度数据库不可用时，需模型回答的请求应返回明确503；已超限返回429，不能退化为无限制模型访问。配额表不存问答内容、行程上下文或原始IP；前端历史只留本页内存。发布前备份代码与SQLite，保留 `.local` 数据链接和权限600的私密配置；构建、校验、全量测试通过后再重启应用。真实服务验收须核对分日数量、用户开始时间、未知政策兜底与官方尾句，不能仅凭mock通过宣称模型质量达标；详见 [问答协议与验收](ask.md)。

### 拍照识景点

在 `/etc/yujianxingji.env` 填入 `XF_VISION_APIKEY` 和 `XF_VISION_MODEL`，后者从已开通图像理解服务的控制台调用信息复制。`XF_VISION_BASE_URL` 默认 `https://maas-api.cn-huabei-1.xf-yun.com/v2`，只配置基础地址，程序追加 `/chat/completions`。HTTP服务采用Bearer凭据，无需APISECRET或HMAC签名；已有星火文字模型权限不等于图像模型权限。示例文件只有空值，真实凭据只留在权限600的服务端配置中，不发到聊天或写入源码。

Node本地入口通过 `scripts/dev.mjs` 白名单读取这三项配置。只为 `/api/vision` 放宽JSON请求体限制到2,000,000字节；服务端还检查解码图片不超过1,400,000字节、JPEG/PNG以及最长边1024px。现有Nginx模板已在443 server配置 `client_max_body_size 2m`，满足上传需要，无需新增location或重复修改线上配置；维护时核对该限制即可。其他API的请求大小限制与行为保持不变。

配额需要已有 `model_usage` 表，按UTC日匿名3次、登录用户10次、全局100次，使用 `vision:` scope，不需要新迁移。保存环境配置后重启 `yujianxingji.service`。未配置时接口应返回503及“图片识别服务尚未配置”，不要为了通过界面演示而伪造识别结果。已有自动测试使用模拟上游；配置后再人工验收龙门石窟、非景点和配额提示。完整协议与验收说明见 [拍照识景点](vision.md)。

## 文件
前端作者文件、server.mjs、完整 worker/index.js、迁移、测试、照片均提交。Worker 由 assemble.py 生成，修改作者文件后重新构建。dist/build、依赖、真实环境配置、日志、临时文件排除。index-offline.html 通过 node scripts/offline.mjs 重建，不计为缺失源码。

## 阿里云 IP HTTPS

当前访问入口为 https://112.124.35.179/，不依赖域名。Nginx 监听443并终止TLS，转发到仅回环地址监听的 `127.0.0.1:8787`。80端口仅保留 `/.well-known/acme-challenge/` 验证目录，其他请求308跳转到固定的HTTPS地址。Nginx覆盖转发的Host及协议头，登录会话在HTTPS下附带Secure属性。

- 代码：`/opt/yujianxingji`；后台服务：`yujianxingji.service`。
- 数据：`/var/lib/yujianxingji/travel.sqlite`；代码目录的 `.local` 链接指向数据目录，更新时必须保留。
- 环境配置：`/etc/yujianxingji.env`，权限600；真实密钥不提交GitHub。
- 证书：`/etc/letsencrypt/live/yujianxingji-ip/`；私钥由root管理，不复制到代码仓库。
- Certbot：`/opt/certbot/bin/certbot`，采用webroot验证，目录为 `/var/www/letsencrypt`。
- 自动续期：`yujianxingji-certbot-renew.timer` 每天00:00与12:00触发检查，按服务器时区执行，随机延迟最多1小时；仅在证书需要更新时续期。成功续期后检查Nginx配置并平滑重载。

配置源文件在 `deploy/aliyun/`：`nginx.conf`、`certbot-renew.service`、`certbot-renew.timer`、`reload-nginx.sh`。Nginx模板含当前服务器IP；更换IP或改用域名时必须重新申请匹配的证书并调整入口，不能直接复用。

首次部署须先安装Certbot 5.4+，准备可从公网80端口访问的webroot验证目录，并由服务器所有者确认证书服务条款。IP证书申请参数如下：

```sh
/opt/certbot/bin/certbot certonly --preferred-profile shortlived \
  --webroot --webroot-path /var/www/letsencrypt \
  --ip-address 112.124.35.179 --cert-name yujianxingji-ip
```

证书签发后再安装HTTPS配置。首次接入时只启用模板中的443 server，保留原80端口代理；验证443端口公网可用后再安装完整模板启用HTTP跳转。以下命令用于已经完成443验证的服务器，以root运行：

```sh
install -m 644 deploy/aliyun/nginx.conf /etc/nginx/sites-available/yujianxingji
nginx -t
systemctl reload nginx
install -m 644 deploy/aliyun/certbot-renew.service /etc/systemd/system/yujianxingji-certbot-renew.service
install -m 644 deploy/aliyun/certbot-renew.timer /etc/systemd/system/yujianxingji-certbot-renew.timer
install -d -m 755 /etc/letsencrypt/renewal-hooks/deploy
install -m 755 deploy/aliyun/reload-nginx.sh /etc/letsencrypt/renewal-hooks/deploy/yujianxingji-nginx
systemctl daemon-reload
systemctl enable --now yujianxingji-certbot-renew.timer
```

这是短期IP证书，自动续期必须保持工作；不是一次签发后长期有效。按 [Let's Encrypt官方说明](https://letsencrypt.org/2026/03/11/shorter-certs-certbot) 使用shortlived配置，并保留80端口验证路径。检查定时器、续期与公网入口：

```sh
systemctl list-timers --all yujianxingji-certbot-renew.timer
journalctl -u yujianxingji-certbot-renew.service --no-pager -n 30
/opt/certbot/bin/certbot renew --dry-run --cert-name yujianxingji-ip --run-deploy-hooks
curl -I http://112.124.35.179/
curl -I https://112.124.35.179/
```

更新应用前备份SQLite数据库与Nginx配置；构建并完成相关测试后重启应用服务。修改部署配置先运行 `nginx -t` 或 `systemd-analyze verify`，验证失败时保留原配置。

## 智能体 SSE

`POST /api/agent` 增加 `Accept: text/event-stream`，默认 JSON 保持兼容。Node 必须使用 `scripts/http-response.mjs` 逐块转发。SSE 返回 `X-Accel-Buffering: no`，现有 Nginx 默认识别，勿强制响应缓冲或缓存。总等待120秒；部署后可用 `engine: rules` 做只读 SSE 连通检查，不调用真实模型、不改写草稿。协议、超时和中断降级见 [智能体架构](agent-architecture.md)。

## 分享行程迁移

发布分享功能前备份SQLite并应用 `drizzle/0004_trip_shares.sql`。独立Node入口会按local_migrations依次应用；D1需先执行迁移再发布。构建前使用锁文件安装依赖（可用 `npm ci --ignore-scripts --no-audit --no-fund`）；本地qrcode构建不依赖安装脚本，不需要CDN或额外密钥。分享存储与限流要求DB可用，未配置时返回503，不静默丢失。完整说明见 [行程分享](share.md)。
