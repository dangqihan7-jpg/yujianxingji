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

### 首页语音输入

在现有 `/etc/yujianxingji.env` 填入同一应用的 `XF_ASR_APPID`、`XF_ASR_APIKEY`、`XF_ASR_APISECRET`，保持权限600，并在讯飞控制台为该应用开通“语音听写（流式版）”。保存后重启 `yujianxingji.service`。没有这组三件套时 `/api/stt` 明确返回503，不影响键盘输入或规划；已有文字/图片模型权限不能代替听写权限，不需要再配文字模型 Key。

浏览器上传原始16kHz/16bit/单声道PCM，最长60秒、1,920,000字节，现有 `client_max_body_size 2m` 足够。仓库 Nginx 模板增加仅作用于 `/api/stt` 的精确 location，`proxy_read_timeout 100s`，保留原代理身份头；上线应将该段合入现有HTTPS server，不覆盖证书、ACME续期或其他location。Node开发入口只为该接口放宽上传上限，后端也流式限制大小。上游按实时节奏发送，长录音录完后仍需等待听写上传。

配额按UTC每个整点重置，匿名3次/小时、登录10次/小时、全局100次/小时；失败调用计数，未配置或输入无效不计数。不保存录音或识别文本。站长配置完成后须亲自按 [语音验收步骤](stt-verification.md) 说一句话，核对结果追加、可编辑、无自动提交。

### 拍照识景点

在 `/etc/yujianxingji.env` 填入 `XF_VISION_APPID`、`XF_VISION_APIKEY`、`XF_VISION_APISECRET`（图片理解服务所在应用的三件套，从控制台该应用的服务页复制）。接口固定为 `wss://spark-api.cn-huabei-1.xf-yun.com/v2.1/image`，走 HMAC-SHA256 签名；`XF_VISION_DOMAIN` 可选，默认 `imagev3`（高级版），应用只开通基础版时填 `general`。该组凭据与海报 `XF_TTI_*` 分开配置、不要混用；已有星火文字模型权限不等于图片理解权限。示例文件只有空值，真实凭据只留在权限600的服务端配置中，不发到聊天或写入源码。

Node本地入口通过 `scripts/dev.mjs` 白名单读取这三项配置。只为 `/api/vision` 放宽JSON请求体限制到2,000,000字节；服务端还检查解码图片不超过1,400,000字节、JPEG/PNG以及最长边1024px。现有Nginx模板已在443 server配置 `client_max_body_size 2m`，满足上传需要，无需新增location或重复修改线上配置；维护时核对该限制即可。其他API的请求大小限制与行为保持不变。

配额需要已有 `model_usage` 表，按UTC日匿名3次、登录用户10次、全局100次，使用 `vision:` scope，不需要新迁移。保存环境配置后重启 `yujianxingji.service`。未配置时接口应返回503及“图片识别服务尚未配置”，不要为了通过界面演示而伪造识别结果。已有自动测试使用模拟上游；配置后再人工验收龙门石窟、非景点和配额提示。完整协议与验收说明见 [拍照识景点](vision.md)。

## 文件
前端作者文件、server.mjs、完整 worker/index.js、迁移、测试、照片均提交。Worker 由 assemble.py 生成，修改作者文件后重新构建。dist/build、依赖、真实环境配置、日志、临时文件排除。index-offline.html 通过 node scripts/offline.mjs 重建，不计为缺失源码。

## 现有阿里云实例：脱离 SSH 的更新部署

本节适用于已有的 Ubuntu 22.04 / Node 24 实例；本次仅交付脚本，**没有连接、修改或重启线上服务器**。脚本不安装或升级 Node、系统包及项目依赖版本；`npm ci` 按现有锁文件安装。已有环境文件必须存在且权限为 600，`.local` 必须链接到 `/var/lib/yujianxingji`，检查不通过就停止，不自动重建账号、数据库或配置。

### 校验慢的诊断（2026-11-03）

针对 `0c4378f` 的已编译产物，`dist/server/index.js` 为 **73,467,407 bytes（70.06 MiB）**；内嵌 `PHOTOS` 行为 72,439,695 bytes，占 **98.60%**。`validate-artifact.mjs` 读取后再将整份源码编码为 **97,956,572 字符的 data URL**，随后 `import`，存在额外编码、解码、模块 URL 处理和解析的内存开销。

在本地 Mac arm64、Node 24.21.0 的分段测量：

| 阶段 | 耗时 |
|---|---:|
| 读取 Worker 与 manifest | 36.02ms |
| 解析 manifest JSON | 0.16ms |
| 生成 data URL | 125.65ms |
| 导入 data URL | 982.46ms |
| default.fetch 断言 | 0.13ms |

原验证器不作任何修改运行，用时约 1.01s，峰值 RSS 1,276,985,344 bytes（约 1.19 GiB）；单独 Node 启动约 0.16s / 44.47 MiB。探针阻断并计数 `fetch`、`WebSocket`，顶层调用均为 0。Worker 数据库操作只在请求处理函数中通过 `env.DB` 执行，校验不会加载打开 SQLite / HTTP 监听的 `scripts/dev.mjs`。

因此已定位**校验自身的热点为大产物的 data URL 导入**，并非 manifest 解析或顶层网络、数据库副作用。本地测量不能代替那台 2 核 2 GiB Ubuntu 的历史遥测；当天是否发生换页、OOM 或其他争用尚无证据，不能宣称已证实。堆限额 512/768 MiB 的原校验对照仍超过 1 GiB RSS，故本次不把堆限额或超时当作根治措施。产物 SHA256：`d2ab5e09e81fd85c68add4b300256117052efde69a3ab0418dd0549c2c290963`。

部署仍完整运行 **`npm run validate`**：读产物、解析 manifest、data URL ESM import、断言 `default.fetch` 全部保留。未修改校验器或测试断言，未增加全量 `npm test`。每次实际部署会记录产物字节数、校验前 `MemAvailable`，若有 `/usr/bin/time` 则记录 validate 的 elapsed 和峰值 RSS，供下次定位；没有该工具时仍运行完整校验。

### 后台运行、锁与日志

选择方案 A：`scripts/deploy-detached.sh` 先取得 `/run/lock/yujianxingji-deploy.lock` 的非阻塞 `flock`，再以 `setsid nohup` 启动部署脚本快照。stdin 来自 `/dev/null`，stdout/stderr 全部写入固定日志 **`/root/yujianxingji-deploy.log`**。工作进程继承同一把 FD 9 锁，启动终端关闭、SSH 断开不影响它；重复启动会提示查看现有日志，不再启动第二份部署，也不截断正在写的日志。直接运行 `deploy-aliyun.sh` 也使用同一把锁，但**脱离 SSH 必须使用新启动脚本**。

启动器打印实际工作进程 PID，保存在 `/run/yujianxingji-deploy.pid`；状态文件 `/run/yujianxingji-deploy.status` 为 STARTING / RUNNING / FAILED / SUCCEEDED。PID 文件只是记录，防重复以锁为准，不会误信被复用的旧 PID。状态为 RUNNING 但进程已消失时不能视为成功。启动快照保存在 `/root/yujianxingji-deploy-run.*`，避免 `git reset` 替换正在执行的脚本；该目录不进入仓库。

每步开始、结束均带北京时间与用时，包括 npm ci、build、validate、写服务、daemon-reload、enable、restart、nginx 配置检查及 reload，例如：

```text
== [2026-11-03 13:14:22] 开始 validate ==
== [2026-11-03 13:14:37] validate 仍在运行，已用时 15s ==
== [2026-11-03 13:15:04] validate 完成，用时 42s ==
```

上述时间仅为日志格式示例。运行中每 15 秒输出心跳；失败打印最后步骤、退出码、脚本行与日志位置。`restart` 失败、服务不 active、启动时间未变化、`nginx -t` 失败或 reload 失败均立即非零退出，状态标记 FAILED，不会输出“部署完成”。脚本不自动回滚已 reset 的源码；失败时保留备份与日志，定位失败步骤后可重新运行。

### 自动备份与保护

在 `git fetch` / `reset --hard origin/main` 前，创建 `/root/yujianxingji-backup-YYYYMMDD-HHMMSS-PID/`（实际完整路径打印进日志，目录权限 700）：

- `app.tar`：整个 `/opt/yujianxingji`，包括 `.git`、node_modules、dist、实际 Worker 和 `.local` 符号链接；保留权限、ACL、扩展属性，不跟随链接把活动数据库当普通文件复制。
- `travel.sqlite`：Python SQLite Online Backup API 对活动数据库做一致性备份，覆盖 WAL 中已提交数据；备份后运行 `PRAGMA quick_check`，失败就不执行 reset。
- `source-head.txt`：备份时的提交号。

备份文件默认权限 600，未自动清理旧备份；请保留足够磁盘空间，备份失败即停止。本次不读出或打印密钥，不修改 `/etc/yujianxingji.env` 的内容、权限或所有者；重置后与完成前核对其指纹、权限和数据链接。systemd 的 WorkingDirectory、ExecStart 不变；`daemon-reload`、`enable` 后明确 `restart` 并核验启动时间已改变。原有含 `ssl_certificate` 的 Nginx 配置不覆盖，`nginx -t` 成功后才 reload。

### 本次本地验证边界

两脚本 `bash -n` 通过。六组隔离测试通过：完整成功、validate 失败、restart 失败、nginx 检查失败、启动时间未更新、后台运行与重跑。最后一组验证启动父进程退出后发送 SIGHUP，仍完成所有步骤；并发第二次启动被拒绝，完成后同一命令可再执行。检查了备份先于 reset、SQLite 副本可读、`.local` / env 权限 / HTTPS 配置不变、失败时不输出成功或继续 reload。

测试在 Mac 临时目录进行，以 Python 的 `os.setsid` / `fcntl.flock` 等模拟本机缺少的 Linux 命令，并替换破坏性系统操作；不是 Ubuntu 实机部署或真实 SSH 断线验收。未连接线上服务器，用户部署后的三项核对仍必须执行。

### 用户下次执行的完整命令

Mac 终端登录：

```sh
ssh -i ~/.ssh/aliyun_edu root@112.124.35.179
```

在服务器依次执行（脚本更新只 checkout 这两个部署文件）：

```sh
cd /opt/yujianxingji
git fetch origin
git checkout origin/main -- scripts/deploy-aliyun.sh scripts/deploy-detached.sh
bash scripts/deploy-detached.sh
tail -n 80 -f /root/yujianxingji-deploy.log
```

`Ctrl+C` 只停止看日志，不会终止后台部署。断线后重新 SSH 登录，仍用上述 `tail` 命令查看。看到“部署完成”后：

```sh
cat /run/yujianxingji-deploy.status
git -C /opt/yujianxingji log --oneline -1
systemctl is-active yujianxingji
systemctl show yujianxingji -p ActiveEnterTimestamp
```

必须同时满足：状态为 SUCCEEDED；HEAD 是本次更新脚本的提交（或之后的目标 main）；服务 active；ActiveEnterTimestamp 为**本次部署的最新启动时间**，不能仍是 `2026-11-02 00:50:55`。只见“部署完成”但启动时间没变，仍按未部署处理。

**HEAD 口径修正：** 本次必须将部署脚本提交到 main，因此 main 不可能仍停在 `0c4378f`；新提交只修改部署相关文件，包含 `0c4378f` 的应用代码。不能同时要求拉最新 main 并让最终 HEAD 恰好等于旧提交。可额外验证祖先关系（无输出且退出码 0 才通过）：

```sh
git -C /opt/yujianxingji merge-base --is-ancestor 0c4378f HEAD
```

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
