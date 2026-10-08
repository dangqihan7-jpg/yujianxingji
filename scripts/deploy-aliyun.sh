#!/bin/bash
# 豫见行迹 · 阿里云独立服务器一键部署
# 适用：Ubuntu / Debian，root 用户运行：bash deploy-aliyun.sh
set -euo pipefail

APP_DIR=/opt/yujianxingji
REPO=https://github.com/dangqihan7-jpg/yujianxingji.git
ENV_FILE=/etc/yujianxingji.env

echo "== 1/5 安装 Node.js 24、git、nginx =="
if ! node --version 2>/dev/null | grep -q '^v24'; then
  apt-get update -qq
  apt-get install -y -qq curl ca-certificates gnupg
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y -qq nodejs git nginx
else
  apt-get install -y -qq git nginx
fi
node --version

echo "== 2/5 拉取代码并构建 =="
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch origin
  git -C "$APP_DIR" reset --hard origin/main
else
  git clone "$REPO" "$APP_DIR"
fi
cd "$APP_DIR"
npm ci --no-audit --no-fund
npm run build
npm run validate

echo "== 3/5 环境配置文件 =="
if [ ! -f "$ENV_FILE" ]; then
  cat > "$ENV_FILE" << 'EOF'
# 独立部署：自建账号登录（注册/登录/会话）
STANDALONE_AUTH=true
TRAVEL_DEV_PORT=8787
# 高德地图（可选；不填则地图与地点搜索使用规则/精选模式）
# AMAP_JS_KEY=
# AMAP_SECURITY_JS_CODE=
# AMAP_WEB_SERVICE_KEY=
# 讯飞星火 X2.5（可选；不填则行程规划使用规则模式）
# LLM_API_KEY=
# LLM_BASE_URL=https://maas-api.cn-huabei-1.xf-yun.com/v2
# LLM_MODEL=spark-x2.5
EOF
  chmod 600 "$ENV_FILE"
  echo "已生成 $ENV_FILE，填入密钥后执行 systemctl restart yujianxingji 生效"
fi

echo "== 4/5 systemd 常驻服务 =="
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
systemctl daemon-reload
systemctl enable --now yujianxingji
sleep 3
systemctl is-active yujianxingji

echo "== 5/5 备份旧站并配置 nginx 反向代理 =="
if [ -d /var/www/html ]; then
  BACKUP=/root/homepage-backup-$(date +%Y%m%d-%H%M%S)
  cp -a /var/www/html "$BACKUP"
  echo "旧个人主页已备份到 $BACKUP"
fi
cat > /etc/nginx/sites-available/yujianxingji << 'EOF'
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
ln -sf /etc/nginx/sites-available/yujianxingji /etc/nginx/sites-enabled/yujianxingji
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo ""
echo "部署完成，访问 http://<服务器公网IP> 即可打开"
echo "服务状态：systemctl status yujianxingji"
echo "实时日志：journalctl -u yujianxingji -f"
echo "注意：阿里云安全组需放行 80 端口"
