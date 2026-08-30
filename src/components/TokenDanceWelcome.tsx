'use client'

import { ArrowRight, Cloud, CreditCard, ExternalLink, KeyRound, UserRound } from 'lucide-react'
import { Language } from '@/lib/i18n'

interface Props {
  lang: Language
  onContinue: () => void
}

export const TOKENDANCE_WELCOME_KEY = 'feynman-tokendance-welcome'
export const TOKENDANCE_WELCOME_VERSION = '2'

const pricingUrl = 'https://tokendance.space/models/deepseek-v4-flash-0731'
const logoUrl = 'https://tokendance.space/TokenDance%E5%93%81%E7%89%8C%E5%9B%BE%E6%A0%87-%E9%80%8F%E6%98%8E%E5%BA%95.svg'

export default function TokenDanceWelcome({ lang, onContinue }: Props) {
  const content = lang === 'zh'
    ? {
        eyebrow: '新账号与云端能力已上线',
        title: '先登录账号，再配置 AI',
        description: '你可以直接浏览系统示例。添加自己的书、保存学习记录或使用 AI 前，请先使用观猹登录；登录后再为当前账号配置 TokenDance API Key。',
        features: [
          { icon: UserRound, title: '观猹登录', text: '确认账号身份和数据归属，用于登录费曼读书助手' },
          { icon: Cloud, title: '账号云端', text: '书籍、学习记录、金句、助手会话和长期记忆按账号保存' },
          { icon: KeyRound, title: 'TokenDance AI', text: 'API Key 和数据传输同意用于生成分析、推荐及助手回复' },
          { icon: CreditCard, title: '余额与计费', text: '在 TokenDance 查询余额、充值并管理路由；费用由用户自己的 Key 承担' }
        ],
        pricing: '查看 TokenDance 实时价目',
        continue: '了解并进入书架'
      }
    : {
        eyebrow: 'Accounts and cloud data are now available',
        title: 'Sign in before configuring AI',
        description: 'You can browse the system sample immediately. Before adding books, saving learning records, or using AI, sign in with Watcha; then configure a TokenDance API key for the current account.',
        features: [
          { icon: UserRound, title: 'Watcha sign-in', text: 'Identifies your account and owns your Feynman Reader cloud data' },
          { icon: Cloud, title: 'Account cloud', text: 'Books, learning records, quotes, sessions, and long-term memories are saved per account' },
          { icon: KeyRound, title: 'TokenDance AI', text: 'An API key and data consent enable analyses, recommendations, and assistant replies' },
          { icon: CreditCard, title: 'Balance and billing', text: 'Check balance, top up, and manage routes in TokenDance; usage is billed to your key' }
        ],
        pricing: 'View TokenDance live pricing',
        continue: 'Continue to bookshelf'
      }

  const handleContinue = () => {
    localStorage.setItem(TOKENDANCE_WELCOME_KEY, TOKENDANCE_WELCOME_VERSION)
    onContinue()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3 backdrop-blur-sm sm:p-5">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="tokendance-welcome-title"
        aria-describedby="tokendance-welcome-description"
        className="brand-dialog tokendance-surface flex max-h-[calc(100dvh-1.5rem)] w-full max-w-3xl flex-col overflow-hidden rounded-xl"
      >
        <div className="brand-dialog-header border-b border-[var(--border)] px-5 py-5 sm:px-8 sm:py-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <img src={logoUrl} alt="TokenDance" className="h-8 w-auto max-w-[180px] object-contain object-left sm:h-10" />
            <span className="rounded-full border border-[color-mix(in_srgb,var(--text-primary)_24%,var(--border))] bg-[color-mix(in_srgb,var(--bg-card)_90%,var(--text-primary)_10%)] px-3 py-1 text-xs font-semibold text-[var(--text-primary)]">
              {content.eyebrow}
            </span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-8 sm:py-7">
          <h1 id="tokendance-welcome-title" className="text-2xl font-bold sm:text-3xl">{content.title}</h1>
          <p id="tokendance-welcome-description" className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-secondary)] sm:text-base">
            {content.description}
          </p>

          <div className="mt-6 grid gap-x-6 gap-y-4 border-y border-[var(--border)] py-5 sm:grid-cols-2">
            {content.features.map(feature => {
              const FeatureIcon = feature.icon
              return (
                <div key={feature.title} className="flex min-w-0 items-start gap-3">
                  <div className="tokendance-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                    <FeatureIcon size={18} aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold">{feature.title}</h2>
                    <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{feature.text}</p>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="brand-offer mt-5 rounded-lg p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="brand-offer-badge">{lang === 'zh' ? '限时优惠' : 'Limited-time savings'}</span>
              <strong className="brand-emphasis-coral text-lg sm:text-xl">
                {lang === 'zh' ? 'DeepSeek V4 Flash 峰时最高约省 20%' : 'Up to about 20% off DeepSeek V4 Flash at peak hours'}
              </strong>
            </div>
            <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">
              {lang === 'zh'
                ? '当前适用于峰时火山方舟端口；实际价格、适用线路、时段及活动期限以 TokenDance 官方实时价目和通知为准。'
                : 'Currently applies to the Volcengine Ark route at peak hours. Actual prices, eligible routes, periods, and offer dates follow TokenDance official live pricing and notices.'}
            </p>
          </div>

        </div>

        <div className="shrink-0 border-t border-[var(--border)] px-5 py-4 sm:px-8 sm:py-5">
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <a
              href={pricingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="tokendance-link inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium hover:underline"
            >
              {content.pricing}
              <ExternalLink size={16} aria-hidden="true" />
            </a>
            <button type="button" onClick={handleContinue} autoFocus className="btn-primary min-h-11 justify-center sm:min-w-52">
              {content.continue}
              <ArrowRight size={17} aria-hidden="true" />
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
