import { Language } from './i18n'

export interface PrivacyPolicySection {
  title: string
  content: string
}

export interface PrivacyPolicyContent {
  title: string
  lastUpdated: string
  sections: PrivacyPolicySection[]
}

export const privacyPolicyContent: Record<Language, PrivacyPolicyContent> = {
  zh: {
    title: '隐私政策',
    lastUpdated: '最后更新：2026年9月9日',
    sections: [
      {
        title: '1. 信息处理范围',
        content: `本应用（"费曼读书助手"）用于整理个人阅读资料和学习记录。为提供这些功能，应用会在登录后按账号处理并在服务端保存以下数据：

• **账号资料**：观猹登录提供的稳定账号标识、昵称和头像，以及您已有或主动设置的个人资料
• **书籍数据**：您添加的书籍、笔记、实践记录等学习数据
• **应用设置**：语言偏好、主题选择等个性化设置
• **费曼小助手数据**：用户主动发起的会话、消息、附件和明确要求保存的长期记忆
• **API Key**：与学习记录分开，由服务端加密保存，不进入学习数据导出

当前观猹登录流程不要求提供手机号或邮箱；旧账号中已有的联系方式可能继续保留在账号资料中。本应用不主动采集精确位置。使用 AI 功能时，与当前任务相关的输入和参考资料会发送给所选的大模型服务。`
      },
      {
        title: '2. 数据存储',
        content: `您可以在账号内整理书籍、笔记和学习记录。正式服务将登录后的个人学习数据按账号保存在服务端数据库中；浏览器 IndexedDB 用于旧版本历史迁移和部分本地预览：

• 登录后，书籍、封面、导入时间、阅读进度、笔记、金句、练习记录、书单、助手会话等归属于当前账号，并在服务端保存
• 正式服务未登录时可以浏览系统示例，但不能新增、修改或保存个人学习数据；开发者启用本地预览旁路时，相关记录可留在当前浏览器，该模式不代表已保存到账号
• 检测到旧版本 IndexedDB 数据时，登录后可在迁移窗口内导入；服务端确认成功后才清理本机用户数据，系统示例书不会上传
• 个性化分析数据只有在“个性化分析授权”开启时才新增记录，关闭后停止新增行为分析
• 正式服务的 AI 请求由服务端代理转发，发送与当前任务相关的输入和参考资料
• 您可以通过“账号中心 > 数据管理”导出或导入个人阅读记录备份
• 备份数据较大时会自动拆分为多个分卷，导入时需一次选择同组全部分卷
• 备份文件不加密，包含书籍原文、笔记、教学实践、角色问答和 AI Token 用量记录，但不包含 API Key
• 清理浏览器网站数据会删除尚未迁移的 IndexedDB 历史数据及本地预览数据，但不会删除已保存到账号的服务端记录

尚未迁移的本机数据被清理且没有备份时，无法由服务端恢复。个人阅读记录与登录账号绑定，可在账号中心查看、导出和删除。`
      },
      {
        title: '3. API Key 使用',
        content: `如果您选择使用 AI 功能：

• API Key 用于连接所选的大模型服务，具体可用模型与渠道以设置页为准
• 必须先登录，登录后才能为当前账号配置或更换 API Key
• 账号中保存的 API Key 由服务端加密，不向浏览器返回其明文；您手动输入密钥时，可以在设置页切换显示或隐藏输入内容
• API Key 不会写入用户数据或备份文件，AI 调用由服务端代理完成
• 您可以随时在设置中删除或更换 API Key
• 您可以随时取消勾选以撤回 AI 数据传输同意；撤回后，本应用不会再发起新的 AI 请求

正式服务中的密钥只允许在登录后配置，并由服务端加密存储。请勿在共享或不受信任的设备上配置密钥。

使用 AI 功能时，可能发送的内容包括书名、作者、简介、阶段学习输入、教学模拟内容、角色问答及用于生成推荐的相关学习内容。登录后上传文档的解析原文作为阅读资料按账号保存在服务端；调用 AI 时，较短文档可能发送完整原文，较长文档会从完整原文中选取与当前任务相关且覆盖不同位置的片段。费曼小助手还可使用当前账号的相关书籍、学习记录、金句、历史会话、主动上传的参考附件及启用的偏好记忆；没有明确书籍匹配时，可使用近期书籍摘要，上下文有长度限制。请勿在这些内容中填写不希望提供给所选 AI 服务的个人敏感信息。

**Token 消耗与费用说明**：当前正式服务通过 TokenDance 使用 **DeepSeek V4 Flash**。每次 AI 调用成功后，本应用会按当前账号记录接口实际返回的输入、输出及合计 Token，您可在“账号中心 > 数据管理”查看并随备份导出。API 返回 Token 数，但不返回实际扣费金额。实际费用取决于调用次数、输入与输出长度、附件内容、模型价格及所选线路，请以 TokenDance 实时价目和账单为准。限时优惠不代表固定价格承诺。

建议：
• 不要在不安全的设备上保存 API Key
• 定期更换您的 API Key
• 不要与他人分享您的 API Key`
      },
      {
        title: '4. 数据安全',
        content: `我们采取以下措施保护您的数据安全：

• 对书名、作者、导入结构和可点击链接等关键输入做基础校验与协议限制
• 登录后的 AI 请求由服务端通过 HTTPS 代理发送
• 个人阅读记录按登录账号读取和保存；导入和导出工具供您自行管理备份

但是请注意：
• 本应用无法防止对您设备的物理访问
• 共享设备或浏览器可能存在安全风险
• 基础输入校验只能降低常见风险，不能保证阻止所有恶意输入或第三方扩展行为
• 请妥善保管您的设备`
      },
      {
        title: '5. 数据删除',
        content: `您有权随时删除您的所有数据：

• 在“账号中心”的书架、金句、助手会话、长期记忆、回收站和数据管理中删除对应内容
• 清除本网站的浏览器数据（包括 IndexedDB）只会删除尚未迁移的本机历史数据和本地预览数据，不会删除账号的服务端记录
• 书籍进入回收站后，可在页面显示的恢复期限内恢复；完成最终删除或超过恢复期限后，不能通过普通用户界面恢复
• 其他记录没有回收站时，删除后不能在应用内恢复；您此前导出的备份文件不会随应用内删除而自动删除

在删除前，我们建议您先导出数据备份。`
      },
      {
        title: '6. 第三方服务',
        content: `本应用使用以下第三方服务：

• **大模型服务**：用于提供书籍分析、学习评估、角色问答、推荐和费曼小助手等 AI 功能
  - 当前正式服务通过 TokenDance 网关调用，其他部署可用渠道以设置页为准
  - 您可通过 TokenDance 授权连接密钥，或自行配置当前渠道的 API Key
  - 使用 AI 功能会将上述相关内容发送给所选大模型服务
  - 您的使用受所选大模型服务的服务条款和隐私政策约束

• **观猹登录**：用于验证账号身份，并向应用提供稳定账号标识、昵称和头像；其处理方式受该服务的条款和隐私政策约束

应用根据当前任务组织相关输入和参考资料，具体范围见“API Key 使用”。`
      },
      {
        title: '7. Cookie 使用',
        content: `本应用使用必要的 Cookie 维持登录会话和完成授权，不使用跨站追踪 Cookie。登录后，若您开启“个性化分析授权”，平台会记录与阅读和助手使用相关的必要事件，用于改善个性化推荐和助手上下文；关闭后停止新增行为分析记录。手机号、邮箱、精确位置和 API Key 不会写入行为分析数据。`
      },
      {
        title: '8. 儿童隐私',
        content: `本应用面向所有年龄段的用户。我们不会故意收集未满 13 岁儿童的个人信息。如果您是未满 13 岁的儿童，请在父母或监护人的指导下使用本应用。`
      },
      {
        title: '9. 政策变更',
        content: `我们可能会不时更新本隐私政策。变更后的政策将在本页面发布，并在页面顶部标注最后更新日期。重大变更可能会在应用内以弹窗形式通知您。

继续使用本应用即表示您接受变更后的隐私政策。`
      },
      {
        title: '10. 联系我们',
        content: `如果您对本隐私政策有任何疑问或建议，请通过以下方式联系我们：

• Email: 18682408521@163.com

我们会在合理时间内回复您的询问。`
      }
    ]
  },
  en: {
    title: 'Privacy Policy',
    lastUpdated: 'Last Updated: September 9, 2026',
    sections: [
      {
        title: '1. Information Processing',
        content: `This app ("Feynman Reader") helps you organize personal reading material and learning records. To provide these features, it processes the following data and stores it on the server under your signed-in account:

• **Account Profile**: The stable account identifier, nickname, and avatar provided by Watcha sign-in, together with your existing or self-managed profile
• **Book Data**: Books, notes, practice records, and other learning data
• **App Settings**: Language preference, theme selection, and other personalized settings
• **Feynman Assistant Data**: User-initiated sessions, messages, attachments, and explicitly saved long-term memories
• **API Key**: Stored separately from learning records, encrypted on the server, and excluded from learning data exports

The current Watcha sign-in flow does not require a phone number or email address; contact details already held in legacy accounts may remain in account profiles. This app does not actively collect precise location. AI features send input and reference material related to the current task to the selected model service.`
      },
      {
        title: '2. Data Storage',
        content: `You can organize books, notes, and learning records within your account. The production service saves personal learning data in a server database scoped to the signed-in account. Browser IndexedDB is used for legacy migration and some local previews:

• After sign-in, books, covers, import time, progress, notes, quotes, practice, lists, and assistant sessions belong to the current account and are saved on the server
• Signed-out users of the production service may browse the system sample but cannot create, modify, or save personal learning data; when a developer enables the local preview bypass, records may remain in that browser, which does not mean they have been saved to an account
• When legacy IndexedDB data is detected, it can be migrated during the migration window after sign-in; local user data is cleared only after server confirmation, and the system sample is excluded
• New personalization analytics records are created only while the corresponding consent is enabled; turning it off stops new analytics records
• Production AI requests use the server proxy to forward input and reference material related to the current task
• You can import or export personal reading record backups in Account Center > Data Management
• Large backups are automatically split into multiple parts; select every part from the same set together when importing
• Backup files are not encrypted and include book text, notes, teaching practice, persona Q&A, and AI token usage records, but exclude the API key
• Clearing browser site data deletes unmigrated IndexedDB history and local preview data, but does not delete records already saved to the account on the server

Local history that has not been migrated and has no backup cannot be recovered from the server after it is cleared. Personal reading records are scoped to your signed-in account and can be viewed, exported, or deleted in Account Center.`
      },
      {
        title: '3. API Key Usage',
        content: `If you choose to use AI features:

• API keys connect to the selected model service; available models and channels are shown in Settings
• You must sign in before configuring or replacing an API key for the current account
• After sign-in, API Key is encrypted in the server-side vault and is not included in user data or backups
• AI requests use the server proxy, so the browser never receives the plaintext stored key
• While manually entering a key, you can show or hide that input in Settings
• You can delete or change your API Key anytime in settings
• You can withdraw AI data transfer consent at any time by clearing the consent checkbox; the app will not start new AI requests after withdrawal

Keys in the production service can only be configured after sign-in and are encrypted on the server. Do not configure keys on shared or untrusted devices.

AI features may send the book title, author, description, learning-phase input, teaching-practice content, persona Q&A, and related learning content used to generate recommendations. After sign-in, parsed document text is saved as reading material on the server under your account. Short documents may be sent in full for an AI request; for longer documents, excerpts relevant to the task and covering different source positions are selected. Feynman Assistant can also use related books, learning records, quotes, prior sessions, explicitly uploaded reference attachments, and enabled preferences from the current account. Recent book summaries may be used when no specific book matches, and context length is bounded. Do not include personal sensitive information that you do not want to provide to the selected AI service.

**Token usage and cost**: The current production service uses **DeepSeek V4 Flash** through TokenDance. After each successful AI call, the app records the input, output, and total token counts returned by the API for the current account. You can view them under Account Center > Data Management and include them in backups. The API returns token counts, not the billed amount. Actual costs depend on request count, input and output length, attachment content, model pricing, and route. Consult TokenDance's live pricing and billing records; limited-time offers are not permanent pricing promises.

Recommendations:
• Don't save API Key on public/shared devices
• Change your API Key regularly
• Don't share your API Key`
      },
      {
        title: '4. Data Security',
        content: `We take the following measures to secure your data:

• Key inputs, including book metadata, import structure, and clickable links, receive basic validation and protocol checks
• Signed-in AI requests are sent through the server proxy over HTTPS; the available route follows the current settings
• Personal reading records are read and saved under the signed-in account; import and export tools let you manage your own backups

However, please note:
• We cannot prevent physical access to your device
• Shared devices or browsers may pose security risks
• Basic input validation reduces common risks but cannot prevent every malicious input or third-party extension behavior
• Please keep your device secure`
      },
      {
        title: '5. Data Deletion',
        content: `You have the right to delete all your data at any time:

• Delete the relevant content from books, quotes, assistant sessions, long-term memories, recycle bin, or data management in Account Center
• Clearing this site's browser data, including IndexedDB, deletes only unmigrated local history and local preview data, not the account's server records
• Books moved to the recycle bin can be restored within the deadline shown there; after final deletion or that deadline, they cannot be restored through the ordinary user interface
• Other records without a recycle bin cannot be restored in the app after deletion; backup files you previously exported are not automatically deleted when you delete records in the app

We recommend exporting a backup before deletion.`
      },
      {
        title: '6. Third-Party Services',
        content: `This app uses the following third-party services:

• **Model Services**: For book analysis, learning assessment, persona Q&A, recommendations, and Feynman Assistant
  - The production service uses the TokenDance gateway; other deployments show their available channels in Settings
  - You can connect a key through TokenDance authorization or configure an API key for the current channel yourself
  - Using AI features sends the related content described above to the selected large-language model service
  - Your use is subject to the selected model service terms and privacy policy

• **Watcha Sign-In**: Verifies account identity and provides the app with a stable account identifier, nickname, and avatar, subject to that service's terms and privacy policy

The app prepares related input and reference material for the current task, as described under API Key Usage.`
      },
      {
        title: '7. Cookie Usage',
        content: `This app uses necessary cookies to maintain login sessions and complete authorization, and does not use cross-site tracking cookies. When you are signed in and the “Personalization analytics” consent is enabled, the service records limited reading and assistant usage events to improve personalization. Turning it off stops new analytics events. Phone numbers, email addresses, precise location, and API keys are not written to analytics data.`
      },
      {
        title: '8. Children\'s Privacy',
        content: `This app is intended for users of all ages. We do not intentionally collect personal information from children under 13. If you are under 13, please use this app under parental guidance.`
      },
      {
        title: '9. Policy Changes',
        content: `We may update this privacy policy from time to time. Changes will be posted on this page with the last updated date at the top. Significant changes may be notified within the app.

Continued use of the app constitutes acceptance of the updated policy.`
      },
      {
        title: '10. Contact Us',
        content: `If you have questions or suggestions about this privacy policy, please contact us:

• Email: 18682408521@163.com

We will respond to your inquiries in a timely manner.`
      }
    ]
  }
}
