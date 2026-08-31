# 官网项目对接与腾讯云部署契约

本文供官网项目和服务器自动化部署使用。费曼读书助手已经独立部署，不要把它重新挂回官网的 `/reader/` 路径。

## 1. 固定架构

| 作用 | 地址 | 负责项目 |
| --- | --- | --- |
| 裸域入口 | `https://deline.top/` | 官网项目，308 到 `www` |
| 品牌官网 | `https://www.deline.top/` | 官网 GitHub 仓库 |
| 费曼读书助手 | `https://reader.deline.top/` | Feynman-Reader 仓库 |
| 未来独立项目 | `https://<project>.deline.top/` | 对应项目仓库 |

产品仓库只负责 `reader.deline.top`。官网仓库不要复制产品构建产物、Nginx 配置或 `public` 资源。

## 2. 官网代码必须修改的内容

1. Feynman Reader 卡片、按钮、导航、文档和 Open Graph 链接统一使用：
   `https://reader.deline.top/`
2. 官网收到下列请求时返回 `410 Gone`，不执行跳转：
   - `/reader`、`/reader/` 及其子路径
   - `/feynmanreader`、`/feynmanreader/` 及其子路径
3. 旧路径上的 query string 不得触发产品页面、OAuth 或支付配置。
4. 官网不要使用 iframe、跨域脚本、localStorage、IndexedDB 或 Service Worker 读取产品数据。
5. 官网“返回首页”只回到 `https://www.deline.top/`；产品中的“官网”按钮已经负责回到该地址。

旧官网入口不再承载产品、OAuth、Token 或支付配置。若用户仍需取回原 origin 的本地数据，应使用单独、只读的迁移说明页，不得在旧路径恢复配置表单。

## 3. DNS 与 TLS

在 DNS 服务商中确认以下记录指向同一台腾讯云入口或同一 WAF/CDN：

```text
deline.top          A/AAAA  <官网服务器或 WAF>
www.deline.top      A/AAAA  <官网服务器或 WAF>
reader.deline.top   A/AAAA  <产品服务器或 WAF>
```

不要让 `reader.deline.top` 解析到官网站点目录。三个 hostname 都必须配置 HTTPS 证书；裸域和 `www` 的证书由官网项目维护，产品证书由产品部署维护。

## 4. 腾讯云服务器首次接入

自动化部署代理执行前先做只读盘点，不要覆盖正在运行的官网：

```bash
hostname
nginx -T 2>/dev/null | grep -nE 'server_name|root|listen'
find /var/www -maxdepth 2 -type d -print 2>/dev/null | sort
git --version
node --version
```

确认官网当前的：

- GitHub 仓库 URL和部署分支（建议 `main`）。
- 当前站点 `root` 目录和构建输出目录（例如 `dist`、`out`、`build`）。
- 当前 Nginx 配置文件路径。
- 当前证书由 Certbot、腾讯云证书还是 WAF 托管。

为官网单独使用目录和发布目录，例如：

```text
/var/www/deline-website              # 当前软链接
/var/www/deline-website-deploy/releases/<commit-or-timestamp>
```

不要使用 `/var/www/feynman-reader`，也不要修改 `/etc/nginx/conf.d/reader.deline.top.conf`。

## 5. 官网 Nginx 最小配置

将下面的 `root` 替换成官网自己的发布软链接。已有 TLS 配置时只合并 `server_name`、重定向和静态文件规则，不要重复监听同一个端口。

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name deline.top www.deline.top;
    return 308 https://www.deline.top$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name deline.top;
    # ssl_certificate / ssl_certificate_key 由官网现有证书配置提供
    return 308 https://www.deline.top$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name www.deline.top;
    root /var/www/deline-website;
    index index.html;

    location = /reader { return 410; }
    location ^~ /reader/ { return 410; }
    location = /feynmanreader { return 410; }
    location ^~ /feynmanreader/ { return 410; }

    location / {
        limit_except GET HEAD { deny all; }
        try_files $uri $uri/index.html $uri.html =404;
    }
}
```

如果官网仍有动态服务端渲染，保留其原有 upstream 配置，只把 `/reader` 两条规则放到同一个 `server` 块中，并确保它们位于通用路由之前。

## 6. GitHub -> 自动化部署 -> Nginx 发布流程

自动化部署应按以下顺序执行，每一步失败都停止，不要切换线上软链接：

1. 获取 GitHub 仓库最新 `main`，校验 commit SHA。
2. 在临时构建目录执行锁定依赖安装和项目构建。
3. 只复制构建产物到新的不可变 release 目录。
4. 运行 `nginx -t`。
5. 原子切换官网软链接，例如 `mv -Tf .next-link /var/www/deline-website`。
6. `systemctl reload nginx`，不要 `restart`。
7. 用公网 HTTPS 请求验收首页、停用入口的 `410` 响应和静态资源。
8. 保留最近 3 至 5 个 release；失败时把软链接切回上一 release，再 reload Nginx。

建议自动化部署使用部署锁，避免重复触发导致两个发布同时进行：

```bash
flock -n /var/lock/deline-website-deploy.lock -c '/usr/local/sbin/deploy-deline-website'
```

GitHub 拉取需要使用只读 Deploy Key 或 GitHub App。不要把 PAT、私钥、Token 写入仓库、网页源码、构建产物或飞书消息。

## 7. 上线验收命令

```bash
curl -fsSI https://www.deline.top/
curl -fsSI https://deline.top/
curl -sSI 'https://www.deline.top/reader/?from=retired'
curl -sSI 'https://www.deline.top/feynmanreader'
curl -fsSI https://reader.deline.top/
curl -fsSI https://reader.deline.top/privacy/
curl -fsSI https://reader.deline.top/manifest.json
```

验收标准：

- `deline.top/` -> `www.deline.top/` 为 `308`。
- `www.deline.top/reader`、`www.deline.top/feynmanreader` 及其子路径均为 `410`。
- `reader.deline.top/` 返回费曼读书助手页面，不能返回官网页面。
- `reader.deline.top/reader`、`reader.deline.top/feynmanreader` 及其子路径均为 `410`。
- 产品页面的 canonical、Open Graph、PWA manifest 和 OAuth callback 使用 `reader.deline.top`；TokenDance `app_url` 保持已登记的应用归因标识 `https://reader.deline.top`。
- 官网和产品均无混合内容、证书错误或跨域存储假设。

## 8. 变更责任

- 官网仓库：品牌页面、官网导航、裸域/www 跳转、官网服务器和官网证书。
- Feynman-Reader 仓库：产品页面、`reader.deline.top`、产品 Nginx、产品 OAuth 回调和产品静态资源。
- DNS/WAF 管理：确保 hostname 指向正确源站，并分别转发到对应 Nginx server block。

任何一方要改变域名、路径、OAuth callback 或本地数据格式，必须先同时更新两边的交接文档和验收脚本，再上线。
