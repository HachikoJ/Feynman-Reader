'use client'

import { useState, useEffect } from 'react'
import { Language, t } from '@/lib/i18n'

export default function PrivacyPolicy() {
  const [lang, setLang] = useState<Language>('zh')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const saved = localStorage.getItem('feynman-language')
    if (saved === 'zh' || saved === 'en') {
      setLang(saved)
    }
  }, [])

  if (!mounted) return null

  const content = {
    zh: {
      title: '隐私政策',
      lastUpdated: '最后更新：2025年1月',
      sections: [
        {
          title: '1. 信息收集',
          content: `本应用（"费曼阅读法"）尊重您的隐私。我们收集的信息包括：

• **书籍数据**：您添加的书籍、笔记、实践记录等学习数据
• **应用设置**：语言偏好、主题选择等个性化设置
• **API Key**：用于调用 AI 服务的密钥（可选）

所有数据仅存储在您的本地浏览器中，我们不会收集或上传您的个人数据。`
        },
        {
          title: '2. 数据存储',
          content: `本应用使用浏览器的 localStorage 功能来存储您的数据：

• 所有数据存储在您的设备本地
• 我们不会将您的数据传输到任何服务器
• 您可以通过"数据管理"功能导出备份
• 清除浏览器数据会导致所有数据丢失`
        },
        {
          title: '3. API Key 使用',
          content: `如果您选择使用 AI 功能：

• API Key 仅用于调用 DeepSeek AI 服务
• API Key 存储在您的本地浏览器中
• 我们不会收集或存储您的 API Key
• 您可以随时在设置中删除或更换 API Key

建议：
• 不要在不安全的设备上保存 API Key
• 定期更换您的 API Key
• 不要与他人分享您的 API Key`
        },
        {
          title: '4. 数据安全',
          content: `我们采取以下措施保护您的数据安全：

• 所有输入都经过验证和清理，防止恶意攻击
• 数据在传输前进行加密处理
• 定期建议您导出数据备份

但是请注意：
• 本应用无法防止对您设备的物理访问
• 共享设备或浏览器可能存在安全风险
• 请妥善保管您的设备`
        },
        {
          title: '5. 数据删除',
          content: `您有权随时删除您的所有数据：

• 在"设置 > 数据管理"中点击清除按钮
• 清除浏览器缓存和 localStorage 也会删除所有数据
• 数据一旦删除将无法恢复

在删除前，我们建议您先导出数据备份。`
        },
        {
          title: '6. 第三方服务',
          content: `本应用使用以下第三方服务：

• **DeepSeek AI**：用于提供智能评估功能
  - 您需要自行申请并配置 API Key
  - 您的使用受 DeepSeek 的服务条款约束

我们对这些第三方服务的内容或隐私政策不承担任何责任。`
        },
        {
          title: '7. Cookie 使用',
          content: `本应用不使用任何追踪 Cookie 或分析工具。我们仅使用 localStorage 来存储必要的应用数据，以提供良好的用户体验。

localStorage 是浏览器提供的本地存储机制，不涉及任何跨站追踪。`
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

• GitHub Issues: [项目地址]
• Email: [联系邮箱]

我们会在合理时间内回复您的询问。`
        }
      ]
    },
    en: {
      title: 'Privacy Policy',
      lastUpdated: 'Last Updated: January 2025',
      sections: [
        {
          title: '1. Information Collection',
          content: `This app ("Feynman Reading") respects your privacy. We collect:

• **Book Data**: Books, notes, practice records, and other learning data
• **App Settings**: Language preference, theme selection, and other personalized settings
• **API Key**: Used to call AI services (optional)

All data is stored locally in your browser. We do not collect or upload your personal data.`
        },
        {
          title: '2. Data Storage',
          content: `This app uses your browser's localStorage to store your data:

• All data is stored locally on your device
• We do not transmit your data to any servers
• You can export backups via "Data Management"
• Clearing browser data will result in data loss`
        },
        {
          title: '3. API Key Usage',
          content: `If you choose to use AI features:

• API Key is only used to call DeepSeek AI services
• API Key is stored locally in your browser
• We do not collect or store your API Key
• You can delete or change your API Key anytime in settings

Recommendations:
• Don't save API Key on public/shared devices
• Change your API Key regularly
• Don't share your API Key with others`
        },
        {
          title: '4. Data Security',
          content: `We take the following measures to secure your data:

• All inputs are validated and sanitized against attacks
• Data is encrypted before transmission
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
• Clearing browser cache or localStorage will also delete all data
• Deleted data cannot be recovered

We recommend exporting a backup before deletion.`
        },
        {
          title: '6. Third-Party Services',
          content: `This app uses the following third-party services:

• **DeepSeek AI**: For intelligent assessment features
  - You need to apply for and configure your own API Key
  - Your use is subject to DeepSeek's terms of service

We are not responsible for the content or privacy policies of these third-party services.`
        },
        {
          title: '7. Cookie Usage',
          content: `This app does not use any tracking cookies or analytics tools. We only use localStorage to store necessary application data for a better user experience.

localStorage is a browser-provided local storage mechanism and does not involve any cross-site tracking.`
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

• GitHub Issues: [Project URL]
• Email: [Contact Email]

We will respond to your inquiries in a timely manner.`
        }
      ]
    }
  }

  const currentContent = content[lang] || content.zh

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4">{currentContent.title}</h1>
        <p className="text-[var(--text-secondary)]">{currentContent.lastUpdated}</p>
      </div>

      {/* Sections */}
      <div className="space-y-8">
        {currentContent.sections.map((section, idx) => (
          <div key={idx} className="card p-6">
            <h2 className="text-xl font-bold mb-4 text-[var(--accent)]">{section.title}</h2>
            <div className="text-[var(--text-secondary)] whitespace-pre-line leading-relaxed">
              {section.content}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="mt-12 text-center">
        <button
          onClick={() => window.history.back()}
          className="btn-secondary"
        >
          ← {lang === 'zh' ? '返回' : 'Back'}
        </button>
      </div>
    </div>
  )
}
