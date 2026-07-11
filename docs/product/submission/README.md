# 费曼阅读法 AI 产品结课作业

## 提交材料清单

- `Product_Plan_ZH.md`：完整产品方案，覆盖产品基本信息、需求来源、方案设计、AI 工作流、产品展示、预期收益和项目复盘。
- `Product_Guide_ZH.md`：本地产品启动方式、真实 Safari 截图索引与能力边界。
- `AI_Workflow_ZH.md`：当前已实现的 AI 学习闭环、规则边界与数据边界。
- `Day1-Day3_Traceability_ZH.md`：从前 3 天作业设想到当前产品能力的逐项对照。
- `Growth_Plan_ZH.md`：增长策略、分阶段定价、Token 成本控制与 PMF 验证计划。
- `screenshots/`：真实项目页面截图。

## 产品运行

本项目是可运行的 Next.js Web 产品。评审环境中执行以下命令：

```bash
npm install
npm run dev
```

浏览器打开 `http://localhost:8080`。首次使用需在设置中配置自己的 DeepSeek API Key，并阅读、滚动到底部后同意隐私政策，才会启用 AI 功能。

## 代码仓库说明

本提交材料与产品代码位于同一项目目录。产品前端采用 Next.js 14、TypeScript、Tailwind CSS 和 IndexedDB；AI 能力使用 DeepSeek V4 Flash。用户 API Key 和学习数据默认保存在本地浏览器，不随本作业包上传。当前产品的已实现能力与待验证能力已在产品方案中明确区分。
