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
    lastUpdated: '最后更新：2026年8月',
    sections: [
      {
        title: '1. 信息处理范围',
        content: `本应用（"费曼读书助手"）尊重您的隐私。登录观猹账号后，以下用户主动产生的学习数据会按账号保存到 Supabase 云端：

• **书籍数据**：您添加的书籍、笔记、实践记录等学习数据
• **应用设置**：语言偏好、主题选择等个性化设置
• **费曼小助手数据**：用户主动发起的会话、消息、附件和明确要求保存的长期记忆
• **API Key**：不进入用户数据表，仅以加密形式由服务端保存

平台不会收集手机号、邮箱、精确位置或与阅读无关的敏感信息。使用 AI 功能时，完成当前任务所需的相关输入会发送给 TokenDance。`
      },
      {
        title: '2. 数据存储',
        content: `本应用使用 Supabase 保存登录后的云端学习数据，并仅将浏览器 IndexedDB 用于旧版本历史数据迁移：

• 登录后，书籍、封面、导入时间、阅读进度、笔记、金句、练习记录、书单、助手会话等保存到账号对应的云端空间
• 未登录时可以浏览系统示例，但不能新增、修改或保存个人学习数据
• 检测到旧版本 IndexedDB 数据时，登录后可在 3 天内迁移；服务端确认成功后才清理本机用户数据，系统示例书不会上传
• 个性化分析数据只有在“个性化分析授权”开启时才新增记录，关闭后停止新增行为分析
• 使用 AI 功能时，TokenDance 请求由服务端代理转发，仅发送当前任务所需内容
• 您可以通过“账号中心 > 数据管理”导出或导入云端备份
• 备份数据较大时会自动拆分为多个分卷，导入时需一次选择同组全部分卷
• 备份文件不加密，包含书籍原文、笔记、教学实践、角色问答和 AI Token 用量记录，但不包含 API Key
• 清理浏览器网站数据会删除尚未迁移的 IndexedDB 历史数据，但不会删除已保存到账号云端的内容

尚未迁移或尚未导出备份的数据无法代为恢复。云端数据与观猹账号绑定，可在账号中心查看、导出和删除。`
      },
      {
        title: '3. API Key 使用',
        content: `如果您选择使用 AI 功能：

• 2026 年 10 月 1 日前，API Key 可用于设置中选择的 DeepSeek V4 Flash 服务或 TokenDance 网关；此后仅支持 TokenDance 网关，旧 DeepSeek 官方 Key 不再可用
• 必须先使用观猹登录，登录后才能为当前账号配置或更换 API Key
• 登录后 API Key 仅以加密形式存储在服务端，设置界面只显示掩码
• API Key 不会写入用户数据或备份文件，TokenDance 调用由服务端代理完成
• 您可以随时在设置中删除或更换 API Key
• 您可以随时取消勾选以撤回 AI 数据传输同意；撤回后，本应用不会再发起新的 AI 请求

密钥只允许在登录后配置，并由服务端保险库存储；未登录状态不会显示、接收或保存 API Key。请勿在共享或不受信任的设备上配置密钥。

使用 AI 功能时，可能发送的内容包括书名、作者、简介、阶段学习输入、教学模拟内容、角色问答及用于生成推荐的相关学习内容。登录后上传文档的解析原文保存在账号对应的 Supabase；调用 AI 时，较短文档可能发送完整原文，较长文档会从完整原文中检索并发送与当前任务相关且覆盖不同位置的片段。请勿在这些内容中填写不希望提供给所选 AI 服务的个人敏感信息。

**Token 消耗与费用说明**：系统预设模型为 **DeepSeek V4 Flash**。每次 AI 调用成功后，本应用会按当前账号记录接口实际返回的输入、输出及合计 Token，您可在“账号中心 > 数据管理”查看并随备份导出。根据当前使用情况粗略估算，一本书完整使用六阶段分析、教学评估、角色问答、重新生成、相关推荐、标签生成等 AI 功能，费用大约为 0.02 元。该数字为当前用量估算；API 返回 Token 数但不返回实际扣费金额，实际费用会随调用次数、输入长度、附件解析字符数量及模型价格变化。根据 TokenDance 官方确认，**v4flash0731** 峰时火山方舟端口提供限时优惠，最高约可省 20%，您可在 TokenDance 界面设置路由偏好。**适用线路、价格、时段与活动期限以 TokenDance 官方实时计费标准及后续通知为准。**

建议：
• 不要在不安全的设备上保存 API Key
• 定期更换您的 API Key
• 不要与他人分享您的 API Key`
      },
      {
        title: '4. 数据安全',
        content: `我们采取以下措施保护您的数据安全：

• 对书名、作者、导入结构和可点击链接等关键输入做基础校验与协议限制
• 登录后的 TokenDance AI 请求由服务端通过 HTTPS 代理发送；2026 年 10 月 1 日后仅支持 TokenDance
• 定期建议您导出数据备份

但是请注意：
• 本应用无法防止对您设备的物理访问
• 共享设备或浏览器可能存在安全风险
• 基础输入校验只能降低常见风险，不能保证阻止所有恶意输入或第三方扩展行为
• 请妥善保管您的设备`
      },
      {
        title: '5. 数据删除',
        content: `您有权随时删除您的所有数据：

• 在“账号中心”的云端书架、金句、助手会话、回收站和数据管理中删除对应内容
• 清除本网站的浏览器数据（包括 IndexedDB）只会删除尚未迁移的本机历史数据，不会删除账号云端数据
• 数据一旦删除将无法恢复

在删除前，我们建议您先导出数据备份。`
      },
      {
        title: '6. 第三方服务',
        content: `本应用使用以下第三方服务：

• **DeepSeek V4 Flash**：用于提供书籍分析、学习评估、角色问答和推荐等 AI 功能
  - 2026 年 10 月 1 日后通过 TokenDance 网关调用
  - 您需要自行创建并配置 TokenDance API Key
  - 使用 AI 功能会将上述相关内容直接发送给 TokenDance
  - 您的使用受 TokenDance 的服务条款约束

TokenDance 将按照其服务条款和隐私政策处理相关服务数据。`
      },
      {
        title: '7. Cookie 使用',
        content: `本应用不使用跨站追踪 Cookie。登录后，若您开启“个性化分析授权”，平台会记录与阅读和助手使用相关的必要事件，用于改善个性化推荐和助手上下文；关闭后停止新增行为分析记录。手机号、邮箱、精确位置和 API Key 不会写入行为分析数据。`
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
    lastUpdated: 'Last Updated: August 2026',
    sections: [
      {
        title: '1. Information Processing',
        content: `This app ("Feynman Reader") respects your privacy. After Watcha sign-in, user-created learning data is stored in account-scoped Supabase, including:

• **Book Data**: Books, notes, practice records, and other learning data
• **App Settings**: Language preference, theme selection, and other personalized settings
• **Feynman Assistant Data**: User-initiated sessions, messages, attachments, and explicitly saved long-term memories
• **API Key**: Encrypted on the server after sign-in and never included in exports

The platform does not collect phone numbers, email addresses, precise location, or sensitive data unrelated to reading. TokenDance requests are proxied by the application server and include only input needed for the current AI task.`
      },
      {
        title: '2. Data Storage',
        content: `This app uses Supabase for signed-in cloud learning data and uses browser IndexedDB only to migrate history from older versions:

• After sign-in, books, covers, import time, progress, notes, quotes, practice, lists, and assistant sessions are saved to account-scoped cloud storage
• Signed-out users may browse the system sample but cannot create, modify, or save personal learning data
• When legacy IndexedDB data is detected, it can be migrated within 3 days after sign-in; local user data is cleared only after server confirmation, and the system sample is excluded
• When signed in, TokenDance requests are proxied by the application server; only task-relevant input is forwarded
• You can import or export cloud backups in Account Center > Data Management
• Large backups are automatically split into multiple parts; select every part from the same set together when importing
• Backup files are not encrypted and include book text, notes, teaching practice, persona Q&A, and AI token usage records, but exclude the API key
• Clearing browser site data deletes unmigrated IndexedDB history but does not delete content already saved to the account cloud

Unmigrated or unexported data cannot be recovered for you. Cloud data is scoped to the signed-in Watcha account and can be viewed, exported, or deleted in Account Center.`
      },
      {
        title: '3. API Key Usage',
        content: `If you choose to use AI features:

• Before October 1, 2026, API Key is used for the selected direct DeepSeek V4 Flash service or TokenDance gateway; after that date, only the TokenDance gateway is supported and official DeepSeek keys no longer work
• You must sign in with Watcha before configuring or replacing an API key for the current account
• After sign-in, API Key is encrypted in the server-side vault and is not included in user data or backups
• TokenDance requests use the server proxy, so the browser never receives the plaintext stored key
• You can delete or change your API Key anytime in settings
• You can withdraw AI data transfer consent at any time by clearing the consent checkbox; the app will not start new AI requests after withdrawal

AI features may send the book title, author, description, learning-phase input, teaching-practice content, persona Q&A, and related learning content used to generate recommendations. After sign-in, the complete parsed source is stored in account-scoped Supabase. Short documents may be sent in full for an AI request; for longer documents, task-relevant excerpts are retrieved from the complete source. Do not include personal sensitive information that you do not want to provide to the selected AI service.

**Token usage and cost**: The preset model is **DeepSeek V4 Flash**. After each successful AI call, the app records the input, output, and total token counts returned by the API for the current account. You can view them under Account Center > Data Management and include them in backups. Based on current usage, the complete set of AI features for one book costs roughly CNY 0.02. This is a current usage estimate; the API returns token counts rather than the billed amount, and actual cost varies with request count, input length, attachment size, and model pricing. According to TokenDance's official clarification, the **v4flash0731** Volcengine Ark route provides limited-time savings of up to about 20% at peak hours, and route preferences can be configured in TokenDance. **Eligible routes, pricing, periods, and offer dates follow TokenDance official live pricing and subsequent notices.**

Recommendations:
• Don't save API Key on public/shared devices
• Change your API Key regularly
• Don't share your API Key`
      },
      {
        title: '4. Data Security',
        content: `We take the following measures to secure your data:

• All inputs are validated and sanitized against attacks
• Signed-in TokenDance AI requests are sent through the server proxy over HTTPS; after October 1, 2026, TokenDance is the supported route
• We recommend regularly exporting backups

However, please note:
• We cannot prevent physical access to your device
• Shared devices or browsers may pose security risks
• Please keep your device secure`
      },
      {
        title: '5. Data Deletion',
        content: `You have the right to delete all your data at any time:

• Delete the relevant content from cloud bookshelf, quotes, assistant sessions, recycle bin, or data management in Account Center
• Clearing this site's browser data, including IndexedDB, deletes only unmigrated local history and does not delete account cloud data
• Deleted data cannot be recovered

We recommend exporting a backup before deletion.`
      },
      {
        title: '6. Third-Party Services',
        content: `This app uses the following third-party services:

• **DeepSeek V4 Flash**: For book analysis, learning assessment, persona Q&A, recommendations, and other AI features
  - It is called through the TokenDance gateway after October 1, 2026
  - You need to create and configure your own TokenDance API Key
  - Using AI features sends the related content described above directly to TokenDance
  - Your use is subject to TokenDance's terms of service

TokenDance processes related service data under its terms of service and privacy policy.`
      },
      {
        title: '7. Cookie Usage',
        content: `This app does not use cross-site tracking cookies. When you are signed in and the “Personalization analytics” consent is enabled, the service records limited reading and assistant usage events to improve personalization. Turning it off stops new analytics events. Phone numbers, email addresses, precise location, and API keys are not written to analytics data.`
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
