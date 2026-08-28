'use client'

import { ArrowRight, BadgePercent, CreditCard, ExternalLink, Route, ShieldCheck } from 'lucide-react'
import { Language } from '@/lib/i18n'

interface Props {
  lang: Language
  onContinue: () => void
}

export const TOKENDANCE_WELCOME_KEY = 'feynman-tokendance-welcome'
export const TOKENDANCE_WELCOME_VERSION = '1'

const pricingUrl = 'https://tokendance.space/models/deepseek-v4-flash-0731'
const logoUrl = 'https://tokendance.space/TokenDance%E5%93%81%E7%89%8C%E5%9B%BE%E6%A0%87-%E9%80%8F%E6%98%8E%E5%BA%95.svg'

export default function TokenDanceWelcome({ lang, onContinue }: Props) {
  const content = lang === 'zh'
    ? {
        eyebrow: '费曼读书助手推荐接入',
        title: '让 AI 阅读接入更省心',
        description: 'TokenDance / TokenPay 为本产品提供 API 授权、余额查询与充值能力。你可以先进入书架体验完整示例，需要生成新内容时再连接。',
        features: [
          { icon: ShieldCheck, title: 'OAuth 授权', text: '在产品内完成授权，无需手动复制 API Key' },
          { icon: BadgePercent, title: '限时优惠', text: 'DeepSeek V4 Flash 峰时火山方舟端口最高约省 20%' },
          { icon: Route, title: '智能路由', text: '支持智能路由，也可在 TokenDance 设置路由偏好' },
          { icon: CreditCard, title: '账户服务', text: '可查询余额、充值，并按恢复提示处理额度问题' }
        ],
        pricing: '查看 TokenDance 实时价目',
        continue: '进入费曼读书助手'
      }
    : {
        eyebrow: 'Recommended integration for Feynman Reader',
        title: 'A simpler way to connect AI reading',
        description: 'TokenDance / TokenPay provides API authorization, balance, and top-up services for this product. Explore the complete sample first, then connect when you need new AI content.',
        features: [
          { icon: ShieldCheck, title: 'OAuth authorization', text: 'Authorize in the product without manually copying an API key' },
          { icon: BadgePercent, title: 'Limited-time savings', text: 'Up to about 20% off the Volcengine Ark route for DeepSeek V4 Flash at peak hours' },
          { icon: Route, title: 'Smart routing', text: 'Use smart routing or set route preferences in TokenDance' },
          { icon: CreditCard, title: 'Account services', text: 'Check balance, top up, and follow recovery guidance for quota issues' }
        ],
        pricing: 'View TokenDance live pricing',
        continue: 'Enter Feynman Reader'
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
        className="brand-dialog tokendance-surface max-h-[calc(100dvh-1.5rem)] w-full max-w-3xl overflow-hidden rounded-xl"
      >
        <div className="brand-dialog-header border-b border-[var(--border)] px-5 py-5 sm:px-8 sm:py-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <img src={logoUrl} alt="TokenDance" className="h-8 w-auto max-w-[180px] object-contain object-left sm:h-10" />
            <span className="rounded-full border border-[color-mix(in_srgb,var(--text-primary)_24%,var(--border))] bg-[color-mix(in_srgb,var(--bg-card)_90%,var(--text-primary)_10%)] px-3 py-1 text-xs font-semibold text-[var(--text-primary)]">
              {content.eyebrow}
            </span>
          </div>
        </div>

        <div className="max-h-[calc(100vh-7rem)] overflow-y-auto px-5 py-5 sm:px-8 sm:py-7">
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

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
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
