#!/bin/bash
# Existing Ubuntu host only. Prefer: bash scripts/deploy-detached.sh
set -Eeuo pipefail
umask 077
APP_DIR=/opt/yujianxingji
DATA_DIR=/var/lib/yujianxingji
ENV_FILE=/etc/yujianxingji.env
LOG_FILE=/root/yujianxingji-deploy.log
LOCK_FILE=/run/lock/yujianxingji-deploy.lock
PID_FILE=/run/yujianxingji-deploy.pid
STATUS_FILE=/run/yujianxingji-deploy.status
CURRENT_STEP=初始化
HEARTBEAT_PID=
DEPLOY_OK=false
log(){ printf '== [%s] %s ==\n' "$(TZ=Asia/Shanghai date '+%Y-%m-%d %H:%M:%S')" "$*"; }
stop_heartbeat(){
  if [[ -n "$HEARTBEAT_PID" ]]; then
    kill "$HEARTBEAT_PID" 2>/dev/null || true
    wait "$HEARTBEAT_PID" 2>/dev/null || true
    HEARTBEAT_PID=
  fi
}
on_error(){
  local rc=$1 line=$2
  trap - ERR
  log "部署失败：步骤=${CURRENT_STEP}，退出码=${rc}，脚本行=${line}；日志：${LOG_FILE}" >&2
  exit "$rc"
}
on_exit(){
  local rc=$?
  stop_heartbeat
  if [[ "$DEPLOY_OK" != true ]]; then
    printf 'FAILED pid=%s step=%s exit=%s\n' "$$" "${CURRENT_STEP}" "${rc}" > "${STATUS_FILE}"
    log "部署未完成：最后步骤=${CURRENT_STEP}；日志：${LOG_FILE}" >&2
  fi
}
step(){
  CURRENT_STEP=$1; shift
  local began=$SECONDS label=$CURRENT_STEP
  printf 'RUNNING pid=%s step=%s\n' "$$" "${label}" > "${STATUS_FILE}"
  log "开始 ${label}"
  (trap - ERR EXIT; while sleep 15; do log "${label} 仍在运行，已用时 $((SECONDS-began))s"; done) 9>&- &
  HEARTBEAT_PID=$!
  "$@"
  stop_heartbeat
  log "${label} 完成，用时 $((SECONDS-began))s"
}
preflight(){
  for tool in node npm git python3 tar systemctl nginx sha256sum readlink stat; do
    command -v "$tool" >/dev/null || { log "缺少依赖：${tool}（本脚本不安装或升级依赖）"; return 1; }
  done
  [[ $(node --version) == v24.* ]] || { log '需要现有 Node 24，不自动升级'; return 1; }
  [[ -d "$APP_DIR/.git" && -f "$DATA_DIR/travel.sqlite" && -f "$ENV_FILE" ]]
  [[ $(stat -c %a "$ENV_FILE") == 600 ]]
  [[ -L "$APP_DIR/.local" && $(readlink -f "$APP_DIR/.local") == "$DATA_DIR" ]]
  ENV_SIGNATURE=$(sha256sum "$ENV_FILE")
  ENV_MODE=$(stat -c '%a:%u:%g' "$ENV_FILE")
  OLD_ACTIVE=$(systemctl show yujianxingji -p ActiveEnterTimestampMonotonic --value)
}
backup(){
  BACKUP_DIR="/root/yujianxingji-backup-$(TZ=Asia/Shanghai date +%Y%m%d-%H%M%S)-$$"
  mkdir -m 700 "$BACKUP_DIR"
  log "备份路径：${BACKUP_DIR}（完整代码目录 + SQLite 在线备份）"
  # Do not dereference .local: the live database is backed up consistently below.
  tar --acls --xattrs -cpf "$BACKUP_DIR/app.tar" -C "$(dirname "$APP_DIR")" "$(basename "$APP_DIR")"
  python3 - "$DATA_DIR/travel.sqlite" "$BACKUP_DIR/travel.sqlite" <<'PYBACKUP'
import sqlite3, sys
from pathlib import Path
with sqlite3.connect(Path(sys.argv[1]).as_uri() + '?mode=ro', uri=True, timeout=30) as source:
    with sqlite3.connect(sys.argv[2]) as target:
        source.backup(target, pages=128, sleep=0.05)
        if target.execute('PRAGMA quick_check').fetchone()[0] != 'ok':
            raise RuntimeError('SQLite backup verification failed')
PYBACKUP
  git -C "$APP_DIR" rev-parse HEAD > "$BACKUP_DIR/source-head.txt"
}
check_preserved(){
  [[ -L "$APP_DIR/.local" && $(readlink -f "$APP_DIR/.local") == "$DATA_DIR" ]]
  [[ $(sha256sum "$ENV_FILE") == "$ENV_SIGNATURE" ]]
  [[ $(stat -c '%a:%u:%g' "$ENV_FILE") == "$ENV_MODE" ]]
}
validate_artifact(){
  log "dist/server/index.js 大小：$(stat -c %s dist/server/index.js) bytes"
  log "校验前可用内存：$(awk '/^MemAvailable:/ {print $2 " KiB"}' /proc/meminfo)"
  # Keep the original validator, data-URL import and every assertion intact.
  if [[ -x /usr/bin/time ]]; then
    /usr/bin/time -f 'validate 资源记录：elapsed=%es peakRSS=%MKiB' npm run validate
  else
    npm run validate
  fi
}
write_service(){
cat > /etc/systemd/system/yujianxingji.service << EOF
[Unit]
Description=豫见行迹 · 河南周末游决策助手
After=network.target

[Service]
Type=simple
WorkingDirectory=$APP_DIR
EnvironmentFile=$ENV_FILE
ExecStart=/usr/bin/node --env-file=$ENV_FILE $APP_DIR/scripts/dev.mjs
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
}
verify_restart(){
  sleep 3
  systemctl is-active --quiet yujianxingji
  local active
  active=$(systemctl show yujianxingji -p ActiveEnterTimestampMonotonic --value)
  [[ -n "$active" && "$active" != 0 && "$active" != "$OLD_ACTIVE" ]] || {
    log '服务启动时间未更新，按部署失败处理'; return 1;
  }
  systemctl show yujianxingji -p ActiveEnterTimestamp -p MainPID
}
configure_nginx(){
if [ -d /var/www/html ]; then
  BACKUP=/root/homepage-backup-$(date +%Y%m%d-%H%M%S)
  cp -a /var/www/html "$BACKUP"
  echo "旧个人主页已备份到 $BACKUP"
fi
NGINX_SITE=/etc/nginx/sites-available/yujianxingji
if [ -f "$NGINX_SITE" ] && grep -q "ssl_certificate" "$NGINX_SITE"; then
  echo "检测到现有 HTTPS 配置，保留不覆盖"
elif [ -f /etc/letsencrypt/live/yujianxingji-ip/fullchain.pem ] && [ -f "$APP_DIR/deploy/aliyun/nginx.conf" ]; then
  cp "$APP_DIR/deploy/aliyun/nginx.conf" "$NGINX_SITE"
  echo "检测到 TLS 证书，已安装仓库 HTTPS 配置"
else
  cat > "$NGINX_SITE" << 'EOF'
server {
    listen 80 default_server;
    server_name _;
    client_max_body_size 2m;
    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF
  echo "未检测到 TLS 证书，使用 HTTP 配置（后续按 docs/deployment.md 配置 HTTPS）"
fi
ln -sf /etc/nginx/sites-available/yujianxingji /etc/nginx/sites-enabled/yujianxingji
rm -f /etc/nginx/sites-enabled/default
}
main(){
  [[ $(id -u) == 0 ]] || { printf '请以 root 运行\n' >&2; exit 1; }
  command -v flock >/dev/null
  if [[ ${1:-} == --detached-child ]]; then
    # The launcher holds this same inherited open-file-description lock.
    [[ $(readlink /proc/$$/fd/9) == "$LOCK_FILE" ]]
    flock -n 9
  else
    exec 9>"$LOCK_FILE"
    if ! flock -n 9; then printf '部署已在运行，请查看 %s\n' "${LOG_FILE}"; exit 0; fi
    : > "$LOG_FILE"
    exec > >(tee -a "$LOG_FILE" 9>&-) 2>&1
  fi
  printf '%s\n' "$$" > "${PID_FILE}"
  trap 'on_error $? $LINENO' ERR
  trap on_exit EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
  log "部署进程 PID=$$；日志：${LOG_FILE}"
  step '环境与数据保护检查' preflight
  step '自动备份' backup
  step 'git fetch' git -C "$APP_DIR" fetch origin
  step 'git reset' git -C "$APP_DIR" reset --hard origin/main
  step '核对私密配置与数据链接' check_preserved
  cd "$APP_DIR"
  step 'npm ci' npm ci --no-audit --no-fund
  step 'build' npm run build
  step 'validate' validate_artifact
  step '写 systemd 服务' write_service
  step 'daemon-reload' systemctl daemon-reload
  step 'enable' systemctl enable yujianxingji
  step 'restart' systemctl restart yujianxingji
  step '核对服务启动时间' verify_restart
  step '保留或配置 nginx' configure_nginx
  step 'nginx -t' nginx -t
  step 'nginx reload' systemctl reload nginx
  step '最终数据保护检查' check_preserved
  local head
  head=$(git -C "$APP_DIR" rev-parse HEAD)
  printf 'SUCCEEDED pid=%s head=%s\n' "$$" "${head}" > "${STATUS_FILE}"
  DEPLOY_OK=true
  log "部署完成 HEAD=${head}；备份：${BACKUP_DIR}；日志：${LOG_FILE}"
}
# All functions are parsed before reset can replace this file on disk.
main "$@"
