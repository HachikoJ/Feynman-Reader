#!/bin/bash
set -euo pipefail

PROJECT_DIR="/root/.openclaw/workspace/Feynman-Reader"
WEB_ROOT="/var/www/feynman-reader"
NGINX_CONFIG="/etc/nginx/conf.d/deline.top.conf"

echo "=========================================="
echo "费曼读书助手静态部署"
echo "=========================================="

cd "$PROJECT_DIR"

echo "1. 安装锁定依赖..."
npm ci

echo "2. 构建静态站点..."
NODE_ENV=production npm run build

echo "3. 发布静态文件..."
install -d -m 755 "$WEB_ROOT"
rsync -a --delete "$PROJECT_DIR/out/" "$WEB_ROOT/"

echo "4. 停止旧的 Node 服务（如存在）..."
pm2 delete feynman-reader 2>/dev/null || true
pm2 save --force >/dev/null 2>&1 || true

echo "5. 更新并校验 Nginx 配置..."
install -m 644 "$PROJECT_DIR/deline.top.conf" "$NGINX_CONFIG"
/usr/sbin/nginx -t
systemctl reload nginx

echo "=========================================="
echo "部署完成：https://www.deline.top"
echo "=========================================="
