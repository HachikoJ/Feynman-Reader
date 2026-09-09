'use client'

import { useState, useEffect, type ReactNode } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  BrainCircuit,
  Check,
  UserRound,
  Sparkles,
  type LucideIcon
} from 'lucide-react'
import { Language } from '@/lib/i18n'
import { useAccountAccess } from './AuthGuard'
import { isWatchaOAuthEnabled } from '@/lib/accountClient'
import { isTokenDanceEnabled } from '@/lib/aiProviderPolicy'

interface Props {
  lang: Language
  aiConfigured: boolean
  onComplete: () => void
  onConfigureApi?: () => void
}

export const ONBOARDING_COMPLETED_KEY = 'feynman-onboarding-completed'
export const ONBOARDING_VERSION = '7'

type TipTone = 'accent' | 'emerald' | 'amber' | 'sky'

interface OnboardingTip {
  text: string
  emphasis: string
  tone?: TipTone
}

interface OnboardingStep {
  title: string
  description: ReactNode
  icon: LucideIcon
  iconTone: TipTone
  tips: OnboardingTip[]
}

const onboardingSteps: Record<Language, OnboardingStep[]> = {
  zh: [
    {
      title: '先看一本完整示例',
      description: '浏览《追风筝的人》系统示例，了解完整学习流程。',
      icon: BookOpen,
      iconTone: 'accent',
      tips: [
        { text: '完整查看六阶段分析，快速理解阅读方法', emphasis: '六阶段分析', tone: 'accent' },
        { text: '查看笔记、教学模拟和角色问答的真实记录', emphasis: '真实记录', tone: 'emerald' },
        { text: '系统示例不计入你的个人数据，也不会参与历史迁移', emphasis: '不计入你的个人数据', tone: 'sky' }
      ]
    },
    {
      title: '开始自己的阅读与练习',
      description: <><strong className="font-bold text-[var(--accent)]">{isWatchaOAuthEnabled() ? '使用【观猹】登录' : '登录账号'}</strong>后，建立自己的书架，记录理解与疑问，继续每一本书的学习。</>,
      icon: UserRound,
      iconTone: 'accent',
      tips: [
        { text: '建立个人书架，按六阶段阅读，用自己的话讲解和练习', emphasis: '个人书架', tone: 'accent' },
        { text: '在账号中心查看金句、学习统计与活动日历，回顾阅读积累', emphasis: '账号中心', tone: 'emerald' },
        { text: '管理助手会话与长期记忆，按需导入或导出学习记录', emphasis: '学习记录', tone: 'sky' }
      ]
    },
    {
      title: '每天用 5 分钟复习',
      description: '书架会给出今天最值得继续的一步，费曼小助手也会结合当前账号自己的学习记录提供帮助。',
      icon: BrainCircuit,
      iconTone: 'emerald',
      tips: [
        { text: '今日复习优先提示薄弱问题或未完成阶段', emphasis: '今日复习', tone: 'accent' },
        { text: '先用自己的话讲清楚，再通过角色追问检验理解', emphasis: '讲清楚', tone: 'emerald' },
        { text: '费曼小助手只读取当前账号允许使用的数据，不会跨用户调用', emphasis: '不会跨用户调用', tone: 'amber' }
      ]
    },
    {
      title: '需要 AI 时，配置 TokenDance',
      description: <>请先<strong className="font-bold text-[var(--text-primary)]">{isWatchaOAuthEnabled() ? '使用【观猹】登录' : '登录账号'}</strong>，再为当前账号配置 TokenDance API Key。生成分析、评估、推荐或使用费曼小助手前，还需同意相关数据传输。</>,
      icon: Sparkles,
      iconTone: 'sky',
      tips: [
        { text: '系统使用 DeepSeek V4 Flash；TokenDance 峰时火山方舟端口最高约省 20%', emphasis: '最高约省 20%', tone: 'emerald' },
        { text: '限时优惠当前适用于峰时火山方舟端口，可在 TokenDance 设置路由偏好', emphasis: '限时优惠', tone: 'amber' },
        { text: 'API Key 登录后加密保存在服务端，不写入数据备份或浏览器明文', emphasis: '加密保存在服务端', tone: 'emerald' },
        { text: '计费以 TokenDance 官方实时标准及后续通知为准', emphasis: '官方实时标准及后续通知', tone: 'amber' }
      ]
    }
  ],
  en: [
    {
      title: 'Start with a complete example',
      description: 'Browse The Kite Runner system sample and learn the complete workflow.',
      icon: BookOpen,
      iconTone: 'accent',
      tips: [
        { text: 'Explore the complete six-phase analysis and learn the method quickly', emphasis: 'six-phase analysis', tone: 'accent' },
        { text: 'See realistic notes, teaching practice, and persona Q&A records', emphasis: 'realistic', tone: 'emerald' },
        { text: 'The system sample is not part of your personal data or legacy migration', emphasis: 'not part of your personal data', tone: 'sky' }
      ]
    },
    {
      title: 'Start your own reading and practice',
      description: `Sign in${isWatchaOAuthEnabled() ? ' with Watcha' : ''} to build your bookshelf, record insights and questions, and continue learning from each book.`,
      icon: UserRound,
      iconTone: 'accent',
      tips: [
        { text: 'Build your personal bookshelf, read through six phases, and practice explaining in your own words', emphasis: 'personal bookshelf', tone: 'accent' },
        { text: 'Review quotes, learning statistics, and your activity calendar in Account Center', emphasis: 'Account Center', tone: 'emerald' },
        { text: 'Manage assistant sessions and long-term memories, and import or export learning records as needed', emphasis: 'learning records', tone: 'sky' }
      ]
    },
    {
      title: 'Review for five minutes a day',
      description: 'The bookshelf highlights the best next step, and Feynman Assistant can use learning records from the current account when allowed.',
      icon: BrainCircuit,
      iconTone: 'emerald',
      tips: [
        { text: 'Today\'s review prioritizes a weak answer or unfinished phase', emphasis: 'Today\'s review', tone: 'accent' },
        { text: 'Explain the book in your own words, then test understanding with persona questions', emphasis: 'your own words', tone: 'emerald' },
        { text: 'Feynman Assistant only reads permitted data from the current account and never mixes users', emphasis: 'never mixes users', tone: 'amber' }
      ]
    },
    {
      title: 'Configure TokenDance when you need AI',
      description: `Sign in${isWatchaOAuthEnabled() ? ' with Watcha' : ''} first, then configure a TokenDance API key for the current account. Analysis, evaluation, recommendations, and Feynman Assistant also require data transfer consent.`,
      icon: Sparkles,
      iconTone: 'sky',
      tips: [
        { text: 'For DeepSeek V4 Flash, TokenDance offers up to about 20% off on the Volcengine Ark route during peak hours', emphasis: 'up to about 20% off', tone: 'emerald' },
        { text: 'Limited-time savings currently apply to the Volcengine Ark route at peak hours; route preferences can be set in TokenDance', emphasis: 'Limited-time savings', tone: 'amber' },
        { text: 'After sign-in, your API key is encrypted on the server and excluded from data backups and browser plaintext', emphasis: 'encrypted on the server', tone: 'emerald' },
        { text: 'Billing follows TokenDance official real-time pricing and subsequent notices', emphasis: 'official real-time pricing', tone: 'amber' }
      ]
    }
  ]
}

const toneClasses: Record<TipTone, string> = {
  accent: 'text-[var(--accent)]',
  emerald: 'brand-emphasis-mint',
  amber: 'brand-emphasis-sun',
  sky: 'text-[var(--accent)]'
}

const iconBackgroundClasses: Record<TipTone, string> = {
  accent: 'bg-[var(--accent)]/12 text-[var(--accent)]',
  emerald: 'bg-[var(--success)]/12 text-[var(--success)]',
  amber: 'bg-[var(--warning)]/16 brand-emphasis-sun',
  sky: 'bg-[var(--accent)]/12 text-[var(--accent)]'
}

function HighlightedTip({ tip, tokenDanceStep = false }: { tip: OnboardingTip; tokenDanceStep?: boolean }) {
  const emphasisIndex = tip.text.indexOf(tip.emphasis)
  if (emphasisIndex < 0) return <span className="text-sm leading-6">{tip.text}</span>

  const tokenDanceEmphasisClass = tip.emphasis.includes('20%')
    ? 'brand-emphasis-coral'
    : tip.emphasis.includes('限时优惠') || tip.emphasis.includes('Limited-time')
      ? 'brand-emphasis-sun'
      : 'text-[var(--text-primary)]'

  return (
    <span className="text-sm leading-6">
      {tip.text.slice(0, emphasisIndex)}
      <strong className={`font-bold ${tokenDanceStep ? tokenDanceEmphasisClass : toneClasses[tip.tone || 'accent']}`}>
        {tip.emphasis}
      </strong>
      {tip.text.slice(emphasisIndex + tip.emphasis.length)}
    </span>
  )
}

export default function Onboarding({ lang, aiConfigured, onComplete, onConfigureApi }: Props) {
  const { hasSignedInAccount, requestLogin } = useAccountAccess()
  const [currentStep, setCurrentStep] = useState(0)
  const [showTour, setShowTour] = useState(true)
  const accountAiConfigured = hasSignedInAccount && aiConfigured
  const watchaOAuthEnabled = isWatchaOAuthEnabled()
  const tokenDanceEnabled = isTokenDanceEnabled()

  // 检查是否已经完成过新手引导
  useEffect(() => {
    const completedVersion = localStorage.getItem(ONBOARDING_COMPLETED_KEY)
    if (completedVersion === ONBOARDING_VERSION) {
      setShowTour(false)
      onComplete()
    }
  }, [onComplete])

  const steps = [...(onboardingSteps[lang] || onboardingSteps.zh)].filter((_, index) => tokenDanceEnabled || index !== 3)
  if (accountAiConfigured && tokenDanceEnabled) {
    steps[steps.length - 1] = lang === 'zh'
      ? {
          title: 'TokenDance 已连接',
          description: `${watchaOAuthEnabled ? '【观猹】' : '账号'}已登录，TokenDance API Key 与 AI 数据传输同意均已保存，可以添加自己的书并开始分析。`,
          icon: Sparkles,
          iconTone: 'emerald',
          tips: [
            { text: 'TokenDance API Key 已加密保存，AI 数据传输同意已生效', emphasis: '已加密保存', tone: 'emerald' },
            { text: '打开《追风筝的人》，查看完整示例', emphasis: '《追风筝的人》', tone: 'accent' },
            { text: '添加自己的书，生成新的六阶段分析', emphasis: '添加自己的书', tone: 'sky' }
          ]
        }
      : {
          title: 'TokenDance is connected',
          description: `Your${watchaOAuthEnabled ? ' Watcha' : ''} account is signed in, and your TokenDance API key and data transfer consent are saved. You can add your own book and start analyzing.`,
          icon: Sparkles,
          iconTone: 'emerald',
          tips: [
            { text: 'Your TokenDance API key is encrypted and AI data transfer consent is active', emphasis: 'is encrypted', tone: 'emerald' },
            { text: 'Open The Kite Runner to explore the complete example', emphasis: 'The Kite Runner', tone: 'accent' },
            { text: 'Add your own book and generate a new six-phase analysis', emphasis: 'Add your own book', tone: 'sky' }
          ]
        }
  }

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      // 完成新手引导
      localStorage.setItem(ONBOARDING_COMPLETED_KEY, ONBOARDING_VERSION)
      setShowTour(false)
      onComplete()
      if (!accountAiConfigured && tokenDanceEnabled) {
        if (!hasSignedInAccount) {
          requestLogin(lang === 'zh'
            ? `请先${isWatchaOAuthEnabled() ? '使用【观猹】' : ''}登录。登录成功后，再为当前账号配置 TokenDance API Key。`
            : `Sign in${isWatchaOAuthEnabled() ? ' with Watcha' : ''} first. After sign-in, configure a TokenDance API key for the current account.`)
        } else {
          onConfigureApi?.()
        }
      }
    }
  }

  const handlePrevious = () => {
    setCurrentStep(step => Math.max(0, step - 1))
  }

  const handleSkip = () => {
    localStorage.setItem(ONBOARDING_COMPLETED_KEY, ONBOARDING_VERSION)
    setShowTour(false)
    onComplete()
  }

  if (!showTour) return null

  const step = steps[currentStep]
  const StepIcon = step.icon

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-2 backdrop-blur-sm sm:items-center sm:p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="onboarding-title" className={`brand-dialog flex max-h-[calc(100dvh-1rem)] w-full max-w-xl flex-col overflow-hidden rounded-xl animate-fade-in sm:max-h-[90vh] ${currentStep === steps.length - 1 ? 'tokendance-surface' : ''}`}>
        {/* 进度指示器 */}
        <div className="flex shrink-0 gap-2 px-5 pt-5 sm:px-6 md:px-8 md:pt-8">
          {steps.map((_, idx) => (
            <div
              key={idx}
              className={`flex-1 h-2 rounded-full transition-colors ${
                idx <= currentStep
                  ? (currentStep === steps.length - 1 ? 'bg-[var(--text-primary)]' : 'bg-[var(--accent)]')
                  : 'bg-[var(--bg-secondary)]'
              }`}
            />
          ))}
        </div>

        {/* 步骤内容 */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-5 sm:px-6 md:px-8">
          <div className="text-center pb-6">
          <div className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-lg ${currentStep === steps.length - 1 ? 'tokendance-icon' : iconBackgroundClasses[step.iconTone]}`}>
            <StepIcon size={32} strokeWidth={1.8} aria-hidden="true" />
          </div>
          <h2 id="onboarding-title" className="text-2xl font-bold mb-3">{step.title}</h2>
          <p className="text-[var(--text-secondary)] mb-6">{step.description}</p>

          {/* 提示列表 */}
          <div className="space-y-2 border-y border-[var(--border)] py-4 text-left">
            {step.tips.map((tip, idx) => (
              <div key={idx} className="flex items-start gap-2.5">
                <Check size={17} strokeWidth={2.5} className={`mt-1 shrink-0 ${currentStep === steps.length - 1 ? 'text-[var(--text-primary)]' : 'text-[var(--accent)]'}`} aria-hidden="true" />
                <HighlightedTip tip={tip} tokenDanceStep={currentStep === steps.length - 1} />
              </div>
            ))}
          </div>
          </div>
        </div>

        {/* 按钮 */}
        <div className="shrink-0 px-5 pb-5 sm:px-6 md:px-8 md:pb-8">
          <div className="flex flex-col-reverse gap-3 sm:flex-row">
          {currentStep > 0 && (
            <button
              type="button"
              onClick={handlePrevious}
              className="btn-secondary flex-1"
            >
              <ArrowLeft size={17} aria-hidden="true" />
              {lang === 'zh' ? '上一步' : 'Previous'}
            </button>
          )}
          <button
            onClick={handleSkip}
            className="btn-secondary flex-1"
          >
            {lang === 'zh' ? '跳过' : 'Skip'}
          </button>
          <button
            onClick={handleNext}
            className="btn-primary flex flex-1 items-center justify-center gap-2"
          >
            {currentStep < steps.length - 1
              ? (lang === 'zh' ? '下一步' : 'Next')
              : !accountAiConfigured
                ? (lang === 'zh' ? '配置 TokenDance' : 'Configure TokenDance')
                : (lang === 'zh' ? '开始使用' : 'Get Started')
            }
            <ArrowRight size={17} aria-hidden="true" />
          </button>
          </div>

          {/* 进度文字 */}
          <div className="mt-4 text-center text-sm text-[var(--text-secondary)]">
            {lang === 'zh'
              ? `${currentStep + 1} / ${steps.length}`
              : `Step ${currentStep + 1} of ${steps.length}`
            }
          </div>
        </div>
      </div>
    </div>
  )
}
