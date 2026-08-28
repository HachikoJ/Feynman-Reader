# 产品说明与截图索引

<p>
  <img src="../../../assets/brand/feynman-reader-logo.png" alt="费曼读书助手 Logo" width="112">
</p>

## 运行方式

```bash
npm install
npm run dev
```

本地访问 `http://localhost:8080`。首次使用会先展示本地数据风险告知，随后完成新手引导，再在设置中通过 TokenDance / TokenPay OAuth 或 API Key 配置 AI。调用前需确认隐私政策。

## 建议体验路径

1. 进入书架，查看已读/在读状态、搜索、统计、详细分析和标签筛选。
2. 打开《追风筝的人》，查看 6/6 阶段学习、阶段内容折叠和综合得分。
3. 切换至“费曼实践”，查看教学模拟输入区、评分记录和角色问答生成入口。
4. 展开角色问答记录，查看 3 道题的用户原回答、分数和 AI 点评。
5. 进入设置和隐私政策，查看本地 Key、AI 数据同意、数据管理与传输边界。

## 当前产品图集

以下截图展示当前产品界面；正式访问地址为 `https://reader.deline.top`。当前默认示例书为《追风筝的人》；最新桌面和移动端截图见 `docs/product/screenshots/01-bookshelf-desktop.png` 与 `docs/product/screenshots/02-bookshelf-mobile.png`。

| 文件 | 展示重点 |
| --- | --- |
| `screenshots/01-bookshelf-safari.png` | 有实际书籍数据的书架、阅读状态、综合得分和添加/上传入口。 |
| `screenshots/02-bookshelf-analytics-safari.png` | 书架详细分析：阅读状态分布与得分分布。 |
| `screenshots/03-bookshelf-tags-safari.png` | 分类与标签筛选。 |
| `screenshots/04-six-phase-learning-safari.png` | 六阶段学习、阶段内容与已读状态。 |
| `screenshots/05-feynman-practice-safari.png` | 教学模拟、角色问答和生成问题入口。 |
| `screenshots/06-teaching-score-history-safari.png` | 教学模拟评分记录和 AI 点评。 |
| `screenshots/07-role-qa-record-safari.png` | 3/3 角色问答记录、逐题回答和 AI 点评。 |
| `screenshots/08-settings-local-first-safari.png` | 本地 API Key、隐私同意、数据管理和金句管理。 |
| `screenshots/09-privacy-policy-safari.png` | 独立隐私政策页与数据传输说明。 |

角色问答和教学模拟截图均来自实际学习记录，不伪造 AI 生成内容。

## 产品边界说明

- 当前支持文本教学模拟，不支持语音输入或语音转写。
- 当前主流程是顺序 6 阶段；学习模式选择尚未对用户开放。
- 当前版本暂不提供自动复习提醒或复习调度服务。
- 本产品不提供云端存储、同步与恢复服务；书籍和学习记录保存在当前浏览器，用户需要按提醒定期导出备份。
- API Key 为空、格式不正确或未确认 AI 数据传输时，设置不会保存，并会定位到需要处理的项目。
- 多标签页同时编辑时会检测数据版本冲突，避免旧页面静默覆盖较新的学习记录。
