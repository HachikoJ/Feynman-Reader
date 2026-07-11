# AI 费曼读书助手 - Feynman Reader

![Next.js](https://img.shields.io/badge/Next.js-14-111111)
![DeepSeek](https://img.shields.io/badge/DeepSeek-AI-3b82f6)
![中文优先](https://img.shields.io/badge/%E4%B8%AD%E6%96%87-%E4%BC%98%E5%85%88-c1121f)
![本地优先](https://img.shields.io/badge/%E6%95%B0%E6%8D%AE-%E6%9C%AC%E5%9C%B0%E4%BC%98%E5%85%88-22c55e)

[为什么做这个](#为什么做这个) · [核心体验](#核心体验) · [产品预览](#产品预览) · [如何运行](#如何运行) · [项目资料](#项目资料) · [联系作者](#联系作者)

**读完不算懂，能讲清楚才算。**

AI 费曼读书助手不是再帮你总结一本书，而是让你把书里的内容讲给 AI 听。AI 会先看你的解释，再从 3 个不同角色的角度追问你，直到你真的知道自己哪里没懂、该怎么改。

> [!IMPORTANT]
> **这是一个本地优先的学习产品。** 学习记录和 API Key 默认保存在用户自己的浏览器里；调用 AI 前，需要先阅读并同意隐私政策。当前使用用户自己的 DeepSeek API Key，不是平台代付的无限 AI 服务。

## GitHub 传播素材

- 一句话简介：把一本书讲给 AI 听，直到 3 个角色都问不倒你。
- 项目短描述：一个基于费曼学习法的 AI 深度阅读工具，包含六阶段学习、教学模拟、严格评分和 3 角色追问。
- 建议 Topics：`ai-learning`、`feynman-technique`、`deepseek`、`nextjs`、`learning-tool`、`critical-thinking`、`readwise`
- 产品素材：真实 Safari 截图、核心流程图和完整录屏均已整理归档。

## 为什么做这个

我以前读技术书时经常有一种错觉：看懂了，划线也划了，笔记也记了。可一旦有人问“这本书到底讲了什么”，脑子会突然卡住。

后来我接触到费曼学习法，里面最打动我的一句话是：**如果不能用简单的话解释，就不算真的理解。**

但自己练的时候有两个问题：没有人逼你讲，也没有人告诉你哪里讲错了。所以我想做一个“装傻但懂行”的 AI 陪练。它不直接替用户想答案，而是把用户推回自己的表达里。

## 核心体验

### 1. 先建立阅读框架

用户可以创建书籍或上传 PDF、Word、Excel 文档。AI 会从背景探索、全书概览、深度拆解、辩证分析、众声回响、融会贯通六个阶段，帮用户建立阅读框架。

### 2. 用自己的话教给 AI

用户需要像给小白上课一样，用至少 200 字解释这本书。AI 会从准确度、完整度、清晰度和综合表现四个维度评分，并明确指出哪里讲清楚了、哪里还不够。

### 3. 接受 3 个角色追问

教学模拟后，AI 会生成固定 3 个不同角色的问题，例如小学生、职场新人、研究者或批评者。每题单独评分，没通过的回答和改进建议都会保留，用户可以只重答这一题。

### 4. 不让平均分掩盖没学会

只有教学模拟达到练习要求，并且 3 个角色问题全部达到 60 分，这本书才会进入“已读”并计算综合得分。这里想解决的是一个很简单的问题：不能因为前面答得不错，就把后面的漏洞平均掉。

## 产品预览

### 书架与学习状态

<p>
  <img src="docs/product/submission/screenshots/04-bookshelf-safari.jpeg" alt="Feynman Reader 书架页面，展示已读和在读书籍、学习进度和综合得分" width="100%">
</p>

书架展示在读/已读状态、阶段进度、综合得分、标签筛选和阅读分析。示例数据使用《乌合之众》，完整呈现深度阅读流程。

### 六阶段阅读

<p>
  <img src="docs/product/submission/screenshots/07-six-phase-learning-safari.jpeg" alt="Feynman Reader 六阶段学习页面" width="100%">
</p>

每个阶段的内容可以折叠查看，用户不需要一开始被长文淹没，需要时再展开原理、背景和思考角度。

### 教学模拟与角色问答

<p>
  <img src="docs/product/submission/screenshots/08-feynman-practice-safari.jpeg" alt="Feynman Reader 教学模拟与角色问答页面" width="100%">
</p>

<p>
  <img src="docs/product/submission/screenshots/10-role-qa-record-safari.jpeg" alt="Feynman Reader 角色问答记录，展示三题回答、评分和 AI 点评" width="100%">
</p>

AI 的作用不是给出“你很棒”的空泛鼓励，而是保留原回答、具体得分和改进方向，让用户知道自己下一次应该怎么讲。

### 核心交互流程

<p>
  <img src="docs/product/core-learning-flow.png" alt="AI 费曼读书助手核心交互流程" width="100%">
</p>

```text
书籍 / 本地文档
  -> 六阶段学习
  -> 用户教学模拟
  -> AI 评分和反馈
  -> 3 个角色追问
  -> 用户逐题重答
  -> 全部通过后更新已读状态和综合得分
```

## AI 怎么工作

```mermaid
flowchart TD
  A[创建书籍或上传本地文档] --> B{已同意 AI 数据使用?}
  B -- 否 --> C[阅读隐私政策并确认]
  C --> B
  B -- 是 --> D[DeepSeek 生成六阶段学习内容]
  D --> E[用户提交自己的教学解释]
  E --> F[AI 评分并指出理解漏洞]
  F --> G[AI 生成 3 个角色问题]
  G --> H[用户逐题回答与修订]
  H --> I{3 题都达到 60 分?}
  I -- 否 --> H
  I -- 是 --> J[更新已读状态和学习记录]
```

| 用户负责 | AI 负责 |
| --- | --- |
| 读书、选择概念、用自己的话解释、决定是否重答 | 生成阶段分析、提出追问、评分并给出改进建议 |
| 保持自己的判断，形成最终理解 | 找出表达中的漏洞，而不是替用户宣布“已经学会” |

## 当前已实现

- 书架管理：创建、编辑、删除、搜索、标签筛选、阅读统计。
- 文档输入：PDF、Word、Excel 内容解析，并作为 AI 分析的参考。
- 六阶段学习：按顺序完成背景、框架、拆解、批判、评价和连接。
- 教学模拟：至少 200 字的个人解释、四维度评分、历史记录。
- 角色问答：固定 3 题、逐题评分、原回答和改进建议、单题重答。
- 本地优先：书籍、设置和学习记录默认保存到 IndexedDB；API Key 默认掩码展示。
- 隐私同意：保存 Key 和调用 AI 前都需要确认数据传输同意，并强制阅读隐私政策到底部。

## 如何运行

```bash
npm install
npm run dev
```

打开 [http://localhost:8080](http://localhost:8080)。第一次使用时：

1. 在设置中填写自己的 DeepSeek API Key。
2. 阅读隐私政策，滚动到底部后勾选同意。
3. 创建一本书或上传资料，开始第一次“讲给 AI 听”的练习。

## 技术栈

- **前端**：Next.js 14、TypeScript、Tailwind CSS
- **AI**：DeepSeek API
- **本地数据**：IndexedDB
- **文档解析**：PDF.js、Mammoth、XLSX
- **测试**：Jest、Playwright

## 项目资料

- [产品方案](docs/product/submission/Product_Plan_ZH.md)：需求来源、用户、核心流程、产品边界和复盘。
- [AI 工作流程](docs/product/submission/AI_Workflow_ZH.md)：模型与规则如何分工，以及数据边界。
- [产品说明](docs/product/submission/Product_Guide_ZH.md)：建议体验路径、真实 Safari 截图索引和功能边界。
- [增长方案](docs/product/submission/Growth_Plan_ZH.md)：增长策略、定价、Token 成本控制与 PMF 验证。

## 还没做，但下一步想做

- 语音输入和转写，让“讲给 AI 听”更自然。
- D1/D7/D21 的复习队列和提醒，让用户回来重讲薄弱点。
- 把目前的浏览器端试用和激活迁移到服务端，提供更可靠的授权和 Token 配额。
- 用真实用户测试：他们愿不愿意讲、会不会重答、7 天后还会不会回来。

## 边界说明

这个项目不是自动读书机，也不应该替用户完成思考。当前版本不支持语音输入、OCR 拍书、可实际触发的遗忘曲线提醒；学习模式配置也还没有接入主流程。

当前本地试用与激活仍采用浏览器端控制，不能当作生产级安全方案。后续将把 API 调用、授权、配额和风控迁移到服务端。

## 更新记录

### 2026-07-11

- 完善角色问答：统一为 3 个角色，逐题保留未通过回答和改进建议。
- 修复学习完成判断：3 题没有全部通过时，不计算综合得分或标记为已读。
- 优化隐私同意、设置布局、密钥显示、数据管理和 Markdown 渲染体验。
- 补充真实 Safari 截图、交互流程图和产品操作录屏。

## 开源授权

本项目基于 [MIT License](LICENSE) 开源。你可以自由使用、复制、修改、合并、发布、分发、再授权或销售本项目副本，但须保留原始版权声明和许可声明。

## 联系作者

喜欢这个项目、想交流 AI 事故段子、反馈新风格，或者想请作者喝杯咖啡，可以通过下面方式联系：

- GitHub：[HachikoJ](https://github.com/HachikoJ)
- 微信：`hostrow`，添加时请备注 `AI事故离职申请`
- 邮箱：`946106011@qq.com`

<table>
  <tr>
    <td align="center">
      <strong>微信联系</strong><br>
      <img src="assets/wechat-contact.png" alt="微信联系二维码" width="220">
    </td>
    <td align="center">
      <strong>微信赞赏</strong><br>
      <img src="assets/donate-wechat.png" alt="微信赞赏码" width="220">
    </td>
    <td align="center">
      <strong>支付宝赞赏</strong><br>
      <img src="assets/donate-alipay.png" alt="支付宝赞赏码" width="220">
    </td>
  </tr>
</table>

---

如果你也有一本“读完觉得懂了，但讲不清楚”的书，试着先讲给 AI 听一次。
