# 产品说明与截图索引

## 运行方式

```bash
npm install
npm run dev
```

本地访问 `http://localhost:8080`。首次使用会经历浏览器端试用/激活、设置 API Key、隐私同意和新手引导。AI 调用使用用户自己的 DeepSeek API Key。

## 建议体验路径

1. 进入书架，展示已读/在读状态、搜索、统计、详细分析和标签筛选。
2. 打开《乌合之众》，展示 6/6 阶段学习、阶段内容折叠和综合得分。
3. 切换至“费曼实践”，展示教学模拟输入区、分维度评分记录和角色问答生成入口。
4. 展开角色问答记录，展示 3 道题均通过、用户原回答和 AI 点评。
5. 进入设置，展示本地 API Key 掩码、AI 数据同意、数据管理、金句管理与隐私政策。

## Safari 真实页面截图

以下截图均从 Safari 中正在运行的 Feynman Reader 页面采集。截图中的示例书为《乌合之众》，API Key 已掩码；其中的成绩和问答内容仅用于展示功能流程。

| 文件 | 展示重点 |
| --- | --- |
| `screenshots/04-bookshelf-safari.jpeg` | 有实际书籍数据的书架、阅读状态、综合得分和添加/上传入口。 |
| `screenshots/05-bookshelf-analytics-safari.jpeg` | 书架详细分析：阅读状态分布与得分分布。 |
| `screenshots/06-bookshelf-tags-safari.jpeg` | 分类与标签筛选。 |
| `screenshots/07-six-phase-learning-safari.jpeg` | 《乌合之众》6/6 阶段学习、阶段内容与已读状态。 |
| `screenshots/08-feynman-practice-safari.jpeg` | 教学模拟、角色问答、三种角色组合与生成问题入口。 |
| `screenshots/09-teaching-score-history-safari.jpeg` | 教学模拟评分记录：83 分及准确度/完整度/清晰度。 |
| `screenshots/10-role-qa-record-safari.jpeg` | 3/3 角色问答记录、逐题回答和 AI 点评。 |
| `screenshots/11-settings-local-first-safari.jpeg` | 本地 API Key、隐私同意、数据管理和金句管理。 |

早期的三张基础截图保留在 `screenshots/01-03`，作为空书架、未配置 Key 设置页和独立隐私政策页补充材料。

## 产品边界说明

- 当前支持文本教学模拟，不支持语音输入或语音转写。
- 当前主流程是顺序 6 阶段；学习模式配置尚未接入主界面。
- 目前没有可实际触发的遗忘曲线提醒或自动复习调度。
- 本地试用/激活逻辑目前用于产品体验控制，生产环境仍需服务端授权与配额控制。
