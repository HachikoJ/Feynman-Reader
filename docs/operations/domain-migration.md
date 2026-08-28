# 域名迁移交接

费曼读书助手的正式地址是 `https://reader.deline.top/`，品牌官网由独立项目负责：`https://www.deline.top/`。

## 域名分层

- `https://deline.top/`：裸域只做 `308` 到 `https://www.deline.top/`，由官网项目维护。
- `https://www.deline.top/`：品牌官网和跨项目导航的唯一正式入口。
- `https://reader.deline.top/`：费曼读书助手产品，本仓库唯一线上站点。
- `https://<project>.deline.top/`：未来独立项目按项目名分配子域名，由各项目自行维护；不要把多个项目合并到同一个路径前缀下。

## 入口约定

- 官网项目将 `https://www.deline.top/reader/` 和 `https://deline.top/reader/` 以 `308` 重定向到 `https://reader.deline.top/`。
- 官网项目的 Feynman Reader 产品卡片、Open Graph 链接和文档统一使用 `https://reader.deline.top/`。
- 本项目的 `reader.deline.top/reader` 和 `reader.deline.top/reader/` 由 Nginx 以 `308` 重定向到 `/`，并保留查询参数；hash 由浏览器保留。
- 本项目导航中的“官网”固定指向 `https://www.deline.top/`。

官网项目适配时请按下面的责任边界实现：

- 官网首页和所有品牌内容继续由 `www.deline.top` 提供；不要把官网资源复制到本项目。
- 官网中的 Feynman Reader 按钮直接链接 `https://reader.deline.top/`，不要再链接产品旧的 `/reader/` 路径。
- 官网收到 `/reader` 或 `/reader/` 请求时返回 `308`，`Location` 使用完整地址 `https://reader.deline.top/`；如请求带 query string，原样附加到新地址。
- 不要依赖跨域 iframe、localStorage 或 IndexedDB 读取产品数据；两个子域名之间没有共享本地存储权限。
- 若官网需要展示“返回官网”入口，产品已经提供，无需在官网项目注入脚本或修改产品页面。

## 本地数据边界

`www.deline.top` 与 `reader.deline.top` 是不同的浏览器 origin，IndexedDB、localStorage、Service Worker 和缓存不会跨域共享。官网项目不能只做 HTTP 重定向后声称数据已迁移。

如果原入口已经有用户数据，官网项目需要在原 origin 保留一个迁移页面，引导用户导出备份，再在新产品域名导入。没有原有数据时，可以直接使用 `308`；两种情况都不要修改本项目的 IndexedDB 数据库名或备份格式。

## 上线前检查

1. `reader.deline.top` 的 DNS、TLS 证书和 WAF 已就绪。
2. 官网项目验证 `www.deline.top/reader/` 跳转到完整的新地址。
3. 本项目验证 `/`、`/privacy/`、`/manifest.json`、`/sw.js` 和旧 `/reader/` 入口。
4. OAuth 回调使用当前产品 origin，即 `https://reader.deline.top/?view=settings&tokendance_callback=1`。
