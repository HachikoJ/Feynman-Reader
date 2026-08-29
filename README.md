# 费曼读书助手 - Feynman Reader

<p align="center">
  <img src="assets/brand/feynman-reader-logo.png" alt="费曼读书助手 Logo" width="144">
</p>

![Next.js](https://img.shields.io/badge/Next.js-16-111111)
![DeepSeek](https://img.shields.io/badge/DeepSeek-AI-3b82f6)
![中文优先](https://img.shields.io/badge/%E4%B8%AD%E6%96%87-%E4%BC%98%E5%85%88-c1121f)
![本地与云端](https://img.shields.io/badge/%E6%95%B0%E6%8D%AE-%E6%9C%AC%E5%9C%B0%E4%B8%8E%E4%BA%91%E7%AB%AF-22c55e)

[English](README.en.md) · [个人官网](https://www.deline.top) · [进入费曼读书助手](https://reader.deline.top/) · [为什么做这个](#为什么做这个) · [核心体验](#核心体验) · [产品预览](#产品预览) · [如何运行](#如何运行) · [项目资料](#项目资料) · [联系作者](#联系作者)

**读完不算懂，能讲清楚才算。**

费曼读书助手不是再帮你总结一本书，而是让你把书里的内容讲给 AI 听。AI 会先看你的解释，再从 3 个不同角色的角度追问你，直到你真的知道自己哪里没懂、该怎么改。

**产品访问：** [https://reader.deline.top/](https://reader.deline.top/)

> [!IMPORTANT]
> **这是一个本地优先、可选云端同步的学习产品。** 未登录时，学习记录默认保存在浏览器 IndexedDB；登录观猹账号后，可在账号中心将本机数据导入 Supabase 云端，并查看自己的云端统计。API Key 由服务端加密保存，不会显示明文。清理浏览器数据前仍建议导出备份。调用 AI 前，需要先阅读并同意隐私政策；TokenDance / TokenPay 是推荐渠道，DeepSeek 官方配置渠道将于 2026 年 10 月 1 日下线，届时旧官方 Key 也不再支持。

## GitHub 传播素材

- 一句话简介：把一本书讲给 AI 听，直到 3 个角色都问不倒你。
- 项目短描述：一个基于费曼学习法的 AI 深度阅读工具，包含六阶段学习、教学模拟、严格评分和 3 角色追问。
- 建议 Topics：`ai-learning`、`feynman-technique`、`deepseek`、`nextjs`、`learning-tool`、`critical-thinking`、`readwise`
- 产品素材：真实 Safari 截图、核心流程图和完整录屏均已整理归档。

[![GitHub stars](https://img.shields.io/github/stars/HachikoJ/Feynman-Reader?style=flat)](https://github.com/HachikoJ/Feynman-Reader)

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

教学模拟后，AI 会从不同类型中随机选择 3 个角色提问，例如初学者、同行者、专家或批评者。每题单独评分，没通过的回答和改进建议都会保留，用户可以只重答这一题。

### 4. 不让平均分掩盖没学会

只有教学模拟达到练习要求，并且 3 个角色问题全部达到 60 分，这本书才会进入“已读”并计算综合得分。这里想解决的是一个很简单的问题：不能因为前面答得不错，就把后面的漏洞平均掉。

## 产品预览

### 书架与学习状态

<p>
  <img src="docs/product/screenshots/01-bookshelf-desktop.png" alt="费曼读书助手桌面书架页面，展示追风筝的人示例、今日复习和学习进度" width="100%">
</p>

<p>
  <img src="docs/product/screenshots/02-bookshelf-mobile.png" alt="费曼读书助手移动端书架页面" width="420">
</p>

书架展示在读/已读状态、阶段进度、综合得分、标签筛选和阅读分析。示例数据使用《追风筝的人》，完整呈现深度阅读流程。

### 六阶段阅读

<p>
  <img src="docs/product/submission/screenshots/04-six-phase-learning-safari.png" alt="费曼读书助手六阶段学习页面" width="100%">
</p>

每个阶段的内容可以折叠查看，用户不需要一开始被长文淹没，需要时再展开原理、背景和思考角度。

### 教学模拟与角色问答

<p>
  <img src="docs/product/submission/screenshots/05-feynman-practice-safari.png" alt="费曼读书助手教学模拟与角色问答页面" width="100%">
</p>

<p>
  <img src="docs/product/submission/screenshots/06-teaching-score-history-safari.png" alt="费曼读书助手教学模拟评分记录，展示分维度评分和 AI 点评" width="100%">
</p>

<p>
  <img src="docs/product/submission/screenshots/07-role-qa-record-safari.png" alt="费曼读书助手角色问答记录，展示三题回答、评分和 AI 点评" width="100%">
</p>

AI 的作用不是给出“你很棒”的空泛鼓励，而是保留原回答、具体得分和改进方向，让用户知道自己下一次应该怎么讲。

### 设置与隐私

<p>
  <img src="docs/product/submission/screenshots/08-settings-local-first-safari.png" alt="费曼读书助手设置页面，展示本地 API Key、数据管理和 AI 数据同意" width="100%">
</p>

<p>
  <img src="docs/product/submission/screenshots/09-privacy-policy-safari.png" alt="费曼读书助手隐私政策页面，展示本地数据和 DeepSeek 传输说明" width="100%">
</p>

API Key 和学习记录默认留在浏览器本地。用户在调用 AI 前需要完成数据传输同意，并可在设置中管理或导出数据。

### 核心交互流程

<p>
  <img src="docs/product/core-learning-flow.png" alt="费曼读书助手核心交互流程" width="100%">
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
  B -- 是 --> D[DeepSeek V4 Flash 生成六阶段学习内容]
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
- 本地优先、可选云端：未登录时书籍、设置和学习记录保存到 IndexedDB；登录后可从账号中心导入到 Supabase。API Key 只在服务端加密保存并始终掩码展示。
- 隐私同意：保存 Key 和调用 AI 前都需要确认数据传输同意，并强制阅读隐私政策到底部。

## 如何运行

```bash
npm install
npm run dev
```

打开 [http://localhost:8080](http://localhost:8080)。第一次使用时：

1. 在设置中选择 TokenDance / TokenPay 并点击 OAuth 授权，或填写 TokenDance API Key。
2. 阅读隐私政策，滚动到底部后勾选同意。
3. 创建一本书或上传资料，开始第一次“讲给 AI 听”的练习。

DeepSeek 官方配置渠道会在 2026 年 10 月 1 日下线；请提前保存相关配置，届时旧官方 Key 不再支持。根据 TokenDance 官方确认，`v4flash0731` 峰时火山方舟端口提供限时优惠，最高约可省 20%，用户也可以在 TokenDance 界面设置路由偏好。实际价格、适用线路、时段和活动期限以 [TokenDance 官方实时价目](https://tokendance.space/models/deepseek-v4-flash-0731)及后续通知为准。

## 技术栈

- **前端**：Next.js 16、TypeScript、Tailwind CSS
- **AI**：DeepSeek API
- **本地数据**：IndexedDB
- **文档解析**：PDF.js、Mammoth、XLSX
- **测试**：Jest、Playwright

## 项目资料

- [产品方案](docs/product/submission/Product_Plan_ZH.md)：需求来源、用户、核心流程和产品边界。
- [AI 工作流程](docs/product/submission/AI_Workflow_ZH.md)：模型与规则如何分工，以及数据边界。
- [产品说明](docs/product/submission/Product_Guide_ZH.md)：建议体验路径、真实 Safari 截图索引和功能边界。
- [增长方案](docs/product/submission/Growth_Plan_ZH.md)：增长策略、定价、Token 成本控制与 PMF 验证。

## 后续规划

- 语音输入和转写，让“讲给 AI 听”更自然。
- D1/D7/D21 的复习队列和提醒，让用户回来重讲薄弱点。
- 如果未来确有商业化需要，再基于服务端授权和 Token 配额重新设计使用控制。
- 用真实用户测试：他们愿不愿意讲、会不会重答、7 天后还会不会回来。

## 边界说明

这个项目不是自动读书机，也不应该替用户完成思考。当前版本暂不提供语音输入、OCR 拍书和自动复习提醒；学习模式选择也尚未对用户开放，线上主流程统一采用顺序 6 阶段。

AI 生成的分析、评分和建议仅用于学习辅助，不保证事实准确性；请结合原书和自己的判断核验重要信息。

## GitHub 关注度

[![Star History Chart](https://api.star-history.com/svg?repos=HachikoJ/Feynman-Reader&type=Date)](https://star-history.com/#HachikoJ/Feynman-Reader&Date)

## 开源授权

本项目基于 [MIT License](LICENSE) 开源。你可以自由使用、复制、修改、合并、发布、分发、再授权或销售本项目副本，但须保留原始版权声明和许可声明。

## 联系作者

喜欢这个项目、想交流 AI 学习产品或反馈问题，可以通过下面方式联系：

- GitHub：[HachikoJ](https://github.com/HachikoJ)
- 微信：`hostrow`，添加时请备注 `费曼读书`
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

---

## 📢 加入交流群

欢迎扫码加入微信交流群，一起交流使用经验、反馈问题：

<p align="center">
  <img src="assets/group-qr.jpg" alt="微信交流群二维码" width="260">
</p>

---
