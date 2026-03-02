#!/bin/bash
# 费曼读书法项目部署脚本（完整版）

echo "=========================================="
echo "费曼读书法项目部署"
echo "=========================================="

PROJECT_DIR="/root/.openclaw/workspace/Feynman-Reader"
DEPLOY_PORT=8080

# 1. 安装依赖
echo "1. 安装项目依赖..."
cd $PROJECT_DIR
npm install

# 2. 构建项目
echo "2. 构建项目..."
NODE_ENV=production npm run build

# 3. 启动服务
echo "3. 启动服务..."
pm2 delete feynman-reader 2>/dev/null
pm2 start npm --name "feynman-reader" -- start

# 4. 保存 PM2 配置
echo "4. 保存 PM2 配置..."
pm2 save
pm2 startup

# 5. 更新 Nginx 配置
echo "5. 更新 Nginx 配置..."
cat > /etc/nginx/conf.d/deline.top.conf << 'EOF'
# 主域名配置 - 费曼读书法项目
server {
    listen 80;
    listen [::]:80;
    server_name deline.top www.deline.top;

    # 费曼读书法项目（反向代理）
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # 培训项目路径（静态文件）
    location /training {
        alias /usr/share/nginx/html/training;
        index index.html;
        try_files $uri $uri/ /training/index.html;
    }

    # 禁止访问敏感文件
    location ~* \.(env|git|svn|htaccess|htpasswd|log|bak|backup|sql|conf|ini)$ {
        deny all;
        access_log off;
        log_not_found off;
    }

    # 访问日志
    access_log /var/log/nginx/deline.top.access.log;
    error_log /var/log/nginx/deline.top.error.log;
}
EOF

# 6. 测试并重启 Nginx
echo "6. 测试并重启 Nginx..."
/usr/sbin/nginx -t && systemctl reload nginx

echo ""
echo "=========================================="
echo "✅ 部署完成！"
echo "=========================================="
echo ""
echo "🌐 访问地址："
echo "  主站（费曼读书法）: http://www.deline.top"
echo "  培训项目: http://www.deline.top/training"
echo ""
echo "📊 管理命令："
echo "  PM2 状态: pm2 status"
echo "  PM2 日志: pm2 logs feynman-reader"
echo "  重启服务: pm2 restart feynman-reader"
echo "  停止服务: pm2 stop feynman-reader"
echo ""
echo "⚠️  重要提示："
echo "  访问网站时需要配置 DeepSeek API Key"
echo "  获取地址: https://platform.deepseek.com/api_keys"
echo ""
