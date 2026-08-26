'use client'

import { useState, useEffect } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  BrainCircuit,
  Check,
  Sparkles,
  type LucideIcon
} from 'lucide-react'
import { Language } from '@/lib/i18n'

interface Props {
  lang: Language
  aiConfigured: boolean
  onComplete: () => void
  onConfigureApi?: () => void
}

export const ONBOARDING_COMPLETED_KEY = 'feynman-onboarding-completed'
export const ONBOARDING_VERSION = '6'

type TipTone = 'accent' | 'emerald' | 'amber' | 'sky'

interface OnboardingTip {
  text: string
  emphasis: string
  tone?: TipTone
}

interface OnboardingStep {
  title: string
  description: string
  icon: LucideIcon
  iconTone: TipTone
  tips: OnboardingTip[]
}

const onboardingSteps: Record<Language, OnboardingStep[]> = {
  zh: [
    {
      title: '先看一本完整示例',
      description: '书架已备好《追风筝的人》的真实学习档案，不配置 API Key 也能立即看到产品效果。',
      icon: BookOpen,
      iconTone: 'accent',
      tips: [
        { text: '完整查看六阶段分析，快速理解阅读方法', emphasis: '六阶段分析', tone: 'accent' },
        { text: '查看笔记、教学模拟和角色问答的真实记录', emphasis: '真实记录', tone: 'emerald' },
        { text: '示例内容清晰标记，可随时删除或替换', emphasis: '清晰标记', tone: 'sky' }
      ]
    },
    {
      title: '每天用 5 分钟复习',
      description: '书架先给出今天最值得继续的一步，再把搜索、统计和批量管理放在次要位置。',
      icon: BrainCircuit,
      iconTone: 'emerald',
      tips: [
        { text: '今日复习优先提示薄弱问题或未完成阶段', emphasis: '今日复习', tone: 'accent' },
        { text: '先用自己的话讲清楚，再通过角色追问检验理解', emphasis: '讲清楚', tone: 'emerald' },
        { text: '学习结果保存在当前浏览器，请定期导出备份', emphasis: '当前浏览器', tone: 'amber' }
      ]
    },
    {
      title: '需要新分析时，再连接 TokenDance',
      description: '只有生成新分析、评估或推荐时才需要配置。授权、同意数据传输和保存会在设置中连续完成。',
      icon: Sparkles,
      iconTone: 'sky',
      tips: [
        { text: '系统使用 DeepSeek V4 Flash，优先通过 TokenDance 接入', emphasis: 'TokenDance', tone: 'accent' },
        { text: 'API Key 仅保存在当前浏览器网站数据中', emphasis: '仅保存在当前浏览器', tone: 'emerald' },
        { text: '计费以 TokenDance 官方实时标准及后续通知为准', emphasis: '官方实时标准及后续通知', tone: 'amber' }
      ]
    }
  ],
  en: [
    {
      title: 'Start with a complete example',
      description: 'The Kite Runner is ready with a realistic learning record, so you can see the product before configuring an API key.',
      icon: BookOpen,
      iconTone: 'accent',
      tips: [
        { text: 'Explore the complete six-phase analysis and learn the method quickly', emphasis: 'six-phase analysis', tone: 'accent' },
        { text: 'See realistic notes, teaching practice, and persona Q&A records', emphasis: 'realistic', tone: 'emerald' },
        { text: 'Sample content is clearly labeled and can be removed or replaced', emphasis: 'clearly labeled', tone: 'sky' }
      ]
    },
    {
      title: 'Review for five minutes a day',
      description: 'The bookshelf leads with the most useful next step, while search, statistics, and management stay secondary.',
      icon: BrainCircuit,
      iconTone: 'emerald',
      tips: [
        { text: 'Today\'s review prioritizes a weak answer or unfinished phase', emphasis: 'Today\'s review', tone: 'accent' },
        { text: 'Explain the book in your own words, then test understanding with persona questions', emphasis: 'your own words', tone: 'emerald' },
        { text: 'Learning data stays in this browser, so export backups regularly', emphasis: 'this browser', tone: 'amber' }
      ]
    },
    {
      title: 'Connect TokenDance when you need new AI work',
      description: 'Configuration is only required for new analysis, evaluation, or recommendations. Authorization, consent, and saving stay in one flow.',
      icon: Sparkles,
      iconTone: 'sky',
      tips: [
        { text: 'The app uses DeepSeek V4 Flash through the recommended TokenDance provider', emphasis: 'TokenDance', tone: 'accent' },
        { text: 'Your API key is stored only in this browser site data', emphasis: 'only in this browser', tone: 'emerald' },
        { text: 'Billing follows TokenDance official real-time pricing and subsequent notices', emphasis: 'official real-time pricing', tone: 'amber' }
      ]
    }
  ]
}

const toneClasses: Record<TipTone, string> = {
  accent: 'text-[var(--accent)]',
  emerald: 'text-emerald-600 dark:text-emerald-400',
  amber: 'text-amber-600 dark:text-amber-400',
  sky: 'text-sky-600 dark:text-sky-400'
}

const iconBackgroundClasses: Record<TipTone, string> = {
  accent: 'bg-[var(--accent)]/12 text-[var(--accent)]',
  emerald: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
  amber: 'bg-amber-500/12 text-amber-600 dark:text-amber-400',
  sky: 'bg-sky-500/12 text-sky-600 dark:text-sky-400'
}

function HighlightedTip({ tip }: { tip: OnboardingTip }) {
  const emphasisIndex = tip.text.indexOf(tip.emphasis)
  if (emphasisIndex < 0) return <span className="text-sm leading-6">{tip.text}</span>

  return (
    <span className="text-sm leading-6">
      {tip.text.slice(0, emphasisIndex)}
      <strong className={`font-bold ${toneClasses[tip.tone || 'accent']}`}>
        {tip.emphasis}
      </strong>
      {tip.text.slice(emphasisIndex + tip.emphasis.length)}
    </span>
  )
}

export default function Onboarding({ lang, aiConfigured, onComplete, onConfigureApi }: Props) {
  const [currentStep, setCurrentStep] = useState(0)
  const [showTour, setShowTour] = useState(true)

  // 检查是否已经完成过新手引导
  useEffect(() => {
    const completedVersion = localStorage.getItem(ONBOARDING_COMPLETED_KEY)
    if (completedVersion === ONBOARDING_VERSION) {
      setShowTour(false)
      onComplete()
    }
  }, [onComplete])

  const steps = [...(onboardingSteps[lang] || onboardingSteps.zh)]
  if (aiConfigured) {
    steps[steps.length - 1] = lang === 'zh'
      ? {
          title: 'TokenDance 已连接',
          description: 'API Key 与数据传输授权均已保存。先体验完整示例，或添加自己的书开始分析。',
          icon: Sparkles,
          iconTone: 'emerald',
          tips: [
            { text: 'TokenDance API Key 和 AI 数据传输授权均已配置完成', emphasis: '均已配置完成', tone: 'emerald' },
            { text: '打开《追风筝的人》，查看完整示例', emphasis: '《追风筝的人》', tone: 'accent' },
            { text: '添加自己的书，生成新的六阶段分析', emphasis: '添加自己的书', tone: 'sky' }
          ]
        }
      : {
          title: 'TokenDance is connected',
          description: 'Your API key and data transfer consent are saved. Explore the complete sample or add your own book.',
          icon: Sparkles,
          iconTone: 'emerald',
          tips: [
            { text: 'Your TokenDance API key and AI data transfer consent are fully configured', emphasis: 'fully configured', tone: 'emerald' },
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
      if (!aiConfigured) onConfigureApi?.()
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="onboarding-title" className="card max-h-[90vh] w-full max-w-xl overflow-y-auto p-6 animate-fade-in md:p-8">
        {/* 进度指示器 */}
        <div className="flex gap-2 mb-6">
          {steps.map((_, idx) => (
            <div
              key={idx}
              className={`flex-1 h-2 rounded-full transition-colors ${
                idx <= currentStep ? 'bg-[var(--accent)]' : 'bg-[var(--bg-secondary)]'
              }`}
            />
          ))}
        </div>

        {/* 步骤内容 */}
        <div className="text-center mb-6">
          <div className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-lg ${iconBackgroundClasses[step.iconTone]}`}>
            <StepIcon size={32} strokeWidth={1.8} aria-hidden="true" />
          </div>
          <h2 id="onboarding-title" className="text-2xl font-bold mb-3">{step.title}</h2>
          <p className="text-[var(--text-secondary)] mb-6">{step.description}</p>

          {/* 提示列表 */}
          <div className="space-y-2 border-y border-[var(--border)] py-4 text-left">
            {step.tips.map((tip, idx) => (
              <div key={idx} className="flex items-start gap-2.5">
                <Check size={17} strokeWidth={2.5} className="mt-1 shrink-0 text-[var(--accent)]" aria-hidden="true" />
                <HighlightedTip tip={tip} />
              </div>
            ))}
          </div>
        </div>

        {/* 按钮 */}
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
              : !aiConfigured
                ? (lang === 'zh' ? '去配置 API' : 'Configure API')
                : (lang === 'zh' ? '开始使用' : 'Get Started')
            }
            <ArrowRight size={17} aria-hidden="true" />
          </button>
        </div>

        {/* 进度文字 */}
        <div className="text-center mt-4 text-sm text-[var(--text-secondary)]">
          {lang === 'zh'
            ? `${currentStep + 1} / ${steps.length}`
            : `Step ${currentStep + 1} of ${steps.length}`
          }
        </div>
      </div>
    </div>
  )
}
