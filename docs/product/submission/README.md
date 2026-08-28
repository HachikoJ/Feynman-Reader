# 费曼读书助手 - 产品资料

## 资料索引

- `Product_Plan_ZH.md`：完整产品方案，覆盖产品基本信息、需求来源、方案设计、AI 工作流、产品展示、预期收益和产品边界。
- `Product_Guide_ZH.md`：本地产品启动方式、真实 Safari 截图索引与能力边界。
- `AI_Workflow_ZH.md`：当前已实现的 AI 学习闭环、规则边界与数据边界。
- `Growth_Plan_ZH.md`：增长策略、分阶段定价、Token 成本控制与 PMF 验证计划。
- `screenshots/`：真实项目页面截图。

## 产品运行

本项目是可运行的 Next.js Web 产品。评审环境中执行以下命令：

```bash
npm install
npm run dev
```

浏览器打开 `http://localhost:8080`。首次使用可先查看默认《追风筝的人》示例；需要调用 AI 时，在设置中优先使用 TokenDance / TokenPay OAuth 或 API Key，并阅读、滚动到底部后同意隐私政策。

## 代码仓库说明

本文档与产品代码位于同一项目目录。产品前端采用 Next.js 16、TypeScript、Tailwind CSS 和 IndexedDB；AI 能力使用 DeepSeek V4 Flash。用户 API Key 和学习数据默认保存在本地浏览器，不会随仓库上传。产品的功能边界已在产品方案中明确说明。
