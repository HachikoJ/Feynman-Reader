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
    lastUpdated: '最后更新：2026年7月',
    sections: [
      {
        title: '1. 信息收集',
        content: `本应用（"费曼读书助手"）尊重您的隐私。我们收集的信息包括：

• **书籍数据**：您添加的书籍、笔记、实践记录等学习数据
• **应用设置**：语言偏好、主题选择等个性化设置
• **API Key**：用于调用 AI 服务的密钥（可选）

除非您主动使用 AI 功能，以上数据仅存储在您的本地浏览器中。使用 AI 功能时，相关输入会直接发送给 DeepSeek。`
      },
      {
        title: '2. 数据存储',
        content: `本应用使用浏览器的 IndexedDB 功能来存储您的主要数据：

• 主要应用数据存储在您的设备本地
• 本应用当前不提供学习数据的云端托管或跨设备同步服务
• 使用 AI 功能时，相关输入会从您的浏览器直接传输给 DeepSeek
• 您可以通过"数据管理"功能导出备份
• 清理浏览器缓存或网站数据、卸载重装、浏览器更新或重置、切换设备或浏览器用户配置，均可能导致数据永久丢失

本平台当前不提供学习数据的云端存储、同步与恢复服务，因此无法恢复未导出的本地数据。请您主动、定期导出备份；因未及时备份造成的数据丢失需由用户自行承担。`
      },
      {
        title: '3. API Key 使用',
        content: `如果您选择使用 AI 功能：

• API Key 仅用于调用 DeepSeek AI 服务
• API Key 存储在当前浏览器的本网站数据中，设置界面默认掩码显示
• 本应用不收集或转存您的 API Key；调用时浏览器会将其直接发送给 DeepSeek
• 您可以随时在设置中删除或更换 API Key

浏览器端无法提供类似服务端密钥保险库的安全隔离。能够访问您的设备、浏览器配置、浏览器扩展或本网站运行环境的主体，可能读取该密钥，因此请勿在共享或不受信任的设备上保存。

使用 AI 功能时，可能发送的内容包括书名、作者、简介、文档前 15,000 个字符、阶段学习输入、教学模拟内容、角色问答及用于生成推荐的相关学习内容。请勿在这些内容中填写不希望提供给 DeepSeek 的个人敏感信息。

建议：
• 不要在不安全的设备上保存 API Key
• 定期更换您的 API Key
• 不要与他人分享您的 API Key`
      },
      {
        title: '4. 数据安全',
        content: `我们采取以下措施保护您的数据安全：

• 对书名、作者、导入结构和可点击链接等关键输入做基础校验与协议限制
• AI 请求由浏览器通过 HTTPS 直接发送至 DeepSeek
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

• 在"设置 > 数据管理"中点击清除按钮
• 清除本网站的浏览器数据（包括 IndexedDB）也会删除所有数据
• 数据一旦删除将无法恢复

在删除前，我们建议您先导出数据备份。`
      },
      {
        title: '6. 第三方服务',
        content: `本应用使用以下第三方服务：

• **DeepSeek AI**：用于提供智能评估功能
  - 您需要自行申请并配置 API Key
  - 使用 AI 功能会将上述相关内容直接发送给 DeepSeek
  - 您的使用受 DeepSeek 的服务条款约束

我们对这些第三方服务的内容或隐私政策不承担任何责任。`
      },
      {
        title: '7. Cookie 使用',
        content: `本应用不使用任何追踪 Cookie 或分析工具。主要应用数据存储在 IndexedDB 中，localStorage 仅保存必要的设备和界面状态标记。

这些浏览器本地存储机制不涉及任何跨站追踪。`
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
    lastUpdated: 'Last Updated: July 2026',
    sections: [
      {
        title: '1. Information Collection',
        content: `This app ("Feynman Reader") respects your privacy. We collect:

• **Book Data**: Books, notes, practice records, and other learning data
• **App Settings**: Language preference, theme selection, and other personalized settings
• **API Key**: Used to call AI services (optional)

Unless you actively use AI features, this data stays in your local browser. When you use AI features, the relevant input is sent directly to DeepSeek.`
      },
      {
        title: '2. Data Storage',
        content: `This app uses your browser's IndexedDB to store its primary data:

• Primary application data is stored locally on your device
• This app currently does not provide cloud hosting or cross-device sync for learning data
• When you use AI features, relevant input is transmitted directly from your browser to DeepSeek
• You can export backups via "Data Management"
• Clearing browser cache or site data, reinstalling, updating or resetting the browser, or switching devices or browser profiles may permanently delete your data

The platform currently does not provide cloud storage, sync, or recovery services for learning data and therefore cannot recover local data that was not exported. Export backups proactively and regularly; users are responsible for losses caused by missing backups.`
      },
      {
        title: '3. API Key Usage',
        content: `If you choose to use AI features:

• API Key is only used to call DeepSeek AI services
• API Key is stored locally in your browser
• This app does not collect or retain your API Key; your browser sends it directly to DeepSeek for a request
• You can delete or change your API Key anytime in settings

AI features may send the book title, author, description, the first 15,000 characters of an uploaded document, learning-phase input, teaching-practice content, persona Q&A, and related learning content used to generate recommendations. Do not include personal sensitive information that you do not want to provide to DeepSeek.

Recommendations:
• Don't save API Key on public/shared devices
• Change your API Key regularly
• Don't share your API Key`
      },
      {
        title: '4. Data Security',
        content: `We take the following measures to secure your data:

• All inputs are validated and sanitized against attacks
• AI requests are sent directly from your browser to DeepSeek over HTTPS
• We recommend regularly exporting backups

However, please note:
• We cannot prevent physical access to your device
• Shared devices or browsers may pose security risks
• Please keep your device secure`
      },
      {
        title: '5. Data Deletion',
        content: `You have the right to delete all your data at any time:

• Click the clear button in "Settings > Data Management"
• Clearing this site's browser data, including IndexedDB, will also delete all data
• Deleted data cannot be recovered

We recommend exporting a backup before deletion.`
      },
      {
        title: '6. Third-Party Services',
        content: `This app uses the following third-party services:

• **DeepSeek AI**: For intelligent assessment features
  - You need to apply for and configure your own API Key
  - Using AI features sends the related content described above directly to DeepSeek
  - Your use is subject to DeepSeek's terms of service

We are not responsible for the content or privacy policies of these third-party services.`
      },
      {
        title: '7. Cookie Usage',
        content: `This app does not use tracking cookies or analytics tools. Primary app data is stored in IndexedDB; localStorage is used only for necessary device and UI state flags.

These browser storage mechanisms do not involve cross-site tracking.`
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
