# 域名迁移交接

费曼读书助手的正式地址是 `https://reader.feline.top/`，品牌官网由独立项目负责：`https://www.deline.top/`。

## 域名分层

- `https://deline.top/`：裸域只做 `308` 到 `https://www.deline.top/`，由官网项目维护。
- `https://www.deline.top/`：品牌官网和跨项目导航的唯一正式入口。
- `https://reader.feline.top/`：费曼读书助手产品，本仓库唯一线上站点。
- `https://<project>.deline.top/`：未来独立项目按项目名分配子域名，由各项目自行维护；不要把多个项目合并到同一个路径前缀下。

## 入口约定

- 官网项目将 `https://www.deline.top/reader/`、`https://deline.top/reader/`、`https://www.deline.top/feynmanreader` 和 `https://deline.top/feynmanreader` 及其子路径返回 `410 Gone`，不再重定向到产品。
- 官网项目的 Feynman Reader 产品卡片、Open Graph 链接和文档统一使用 `https://reader.feline.top/`。
- 本项目的 `reader.feline.top/reader`、`reader.feline.top/reader/`、`reader.feline.top/feynmanreader` 及其子路径由 Nginx 返回 `410 Gone`，不再进入产品或配置页面。
- 本项目导航中的“官网”固定指向 `https://www.deline.top/`。

官网项目适配时请按下面的责任边界实现：

- 官网首页和所有品牌内容继续由 `www.deline.top` 提供；不要把官网资源复制到本项目。
- 官网中的 Feynman Reader 按钮直接链接 `https://reader.feline.top/`，不要再链接产品旧的 `/reader/` 或 `/feynmanreader` 路径。
- 官网收到 `/reader`、`/reader/`、`/feynmanreader` 或对应子路径时返回 `410 Gone`，不执行跳转，也不处理其中的 query string。
- 不要依赖跨域 iframe、localStorage 或 IndexedDB 读取产品数据；两个子域名之间没有共享本地存储权限。
- 若官网需要展示“返回官网”入口，产品已经提供，无需在官网项目注入脚本或修改产品页面。

## 本地数据边界

`www.deline.top` 与 `reader.feline.top` 是不同的浏览器 origin，IndexedDB、localStorage、Service Worker 和缓存不会跨域共享。官网项目不能只做 HTTP 重定向后声称数据已迁移。

原入口不再承载产品、OAuth、Token 或支付配置。若用户仍需取回原 origin 的本地数据，应使用单独、只读的迁移说明页，不得在旧路径恢复登录、充值或 API Key 配置表单。

## 上线前检查

1. `reader.feline.top` 的 DNS、TLS 证书和 WAF 已就绪。
2. 官网项目验证 `/reader`、`/feynmanreader` 及其子路径均返回 `410`。
3. 本项目验证 `/`、`/privacy/`、`/manifest.json`、`/sw.js` 和所有停用入口均返回预期状态。
4. TokenDance `app_url` 继续使用已登记的裸域归因标识 `https://deline.top`；OAuth callback 固定为 `https://reader.feline.top/?view=settings&tokendance_callback=1`。
