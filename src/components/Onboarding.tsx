'use client'

import { useState, useEffect } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  BrainCircuit,
  Check,
  GraduationCap,
  NotebookPen,
  ShieldCheck,
  Sparkles,
  WalletCards,
  type LucideIcon
} from 'lucide-react'
import { Language } from '@/lib/i18n'

interface Props {
  lang: Language
  onComplete: () => void
}

export const ONBOARDING_COMPLETED_KEY = 'feynman-onboarding-completed'
export const ONBOARDING_VERSION = '5'

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

// 引导步骤数据
const onboardingSteps: Record<Language, OnboardingStep[]> = {
  zh: [
    {
      title: '欢迎使用费曼读书助手',
      description: '从建立书架到完成费曼实践，把阅读、理解、输出和复盘集中在一个流程里。',
      icon: BookOpen,
      iconTone: 'accent',
      tips: [
        { text: '手动添加书籍，或上传 PDF、DOCX、Markdown、TXT、JSON 文档自动解析', emphasis: '手动添加书籍', tone: 'accent' },
        { text: '维护完整书籍信息，包括书名、作者、简介、封面和标签', emphasis: '完整书籍信息', tone: 'sky' },
        { text: '支持搜索与多维筛选，可按书名、作者、标签、阅读状态和分类定位书籍', emphasis: '搜索与多维筛选', tone: 'emerald' },
        { text: '书架会同步展示阶段进度和已完成的综合成绩', emphasis: '阶段进度和综合成绩', tone: 'amber' }
      ]
    },
    {
      title: '六阶段深度阅读',
      description: 'DeepSeek V4 Flash 会从六个真实维度分析书籍，分析结果按阶段保存并支持折叠阅读。',
      icon: BrainCircuit,
      iconTone: 'sky',
      tips: [
        { text: '背景探索：了解作者、写作背景与时代环境', emphasis: '背景探索', tone: 'accent' },
        { text: '全书概览：建立整本书的核心框架与整体认识', emphasis: '全书概览', tone: 'sky' },
        { text: '深度拆解：拆解核心观点、概念、论证和实例', emphasis: '深度拆解', tone: 'emerald' },
        { text: '辩证分析：识别观点边界、反例与可能的争议', emphasis: '辩证分析', tone: 'amber' },
        { text: '众声回响：理解评价、影响和不同视角', emphasis: '众声回响', tone: 'accent' },
        { text: '融会贯通：连接已有知识、现实经验与行动', emphasis: '融会贯通', tone: 'emerald' }
      ]
    },
    {
      title: '费曼实践与评分',
      description: '先用自己的话讲清楚，再接受不同角色追问；只有两部分都通过，才会形成完整综合成绩。',
      icon: GraduationCap,
      iconTone: 'emerald',
      tips: [
        { text: '教学模拟从准确度、完整度、清晰度和综合表现四个维度评分', emphasis: '四个维度评分', tone: 'sky' },
        { text: '教学模拟达到 60 分后，可生成 3 个不同角色的问题', emphasis: '60 分后', tone: 'emerald' },
        { text: '角色问答逐题评分，未通过的回答会保留记录并支持继续重答', emphasis: '保留记录并支持继续重答', tone: 'amber' },
        { text: '教学模拟与 3 道角色问题全部通过后，才显示完整综合成绩', emphasis: '全部通过后', tone: 'accent' }
      ]
    },
    {
      title: '记录、整理与延伸阅读',
      description: '学习结果不只停留在一次分析中，还可以持续记录、整理并延伸到下一本书。',
      icon: NotebookPen,
      iconTone: 'amber',
      tips: [
        { text: '阅读笔记用于自主记录与回顾，不进行 AI 评分', emphasis: '不进行 AI 评分', tone: 'emerald' },
        { text: '教学模拟和角色问答记录会按书籍保留，方便查看改进过程', emphasis: '按书籍保留', tone: 'sky' },
        { text: '可使用 AI 生成书籍标签，并统一管理标签与分类', emphasis: 'AI 生成书籍标签', tone: 'accent' },
        { text: '完成费曼实践后，可获取同作者、相关主题和阅读路径推荐，并直接加入书架', emphasis: '直接加入书架', tone: 'amber' }
      ]
    },
    {
      title: 'DeepSeek V4 Flash 与费用',
      description: 'AI 功能使用你自行配置的 DeepSeek API Key，平台按任务调用系统预设模型。',
      icon: WalletCards,
      iconTone: 'accent',
      tips: [
        { text: '系统预设模型为 DeepSeek V4 Flash', emphasis: 'DeepSeek V4 Flash', tone: 'accent' },
        { text: '根据当前使用情况，一本书完整使用各项 AI 功能的费用约为 0.02 元，仅供参考', emphasis: '约为 0.02 元，仅供参考', tone: 'emerald' },
        { text: '实际费用会随调用次数、输入长度和附件解析字符数量波动', emphasis: '实际费用会随调用次数、输入长度和附件解析字符数量波动', tone: 'amber' },
        { text: '模型计费以 DeepSeek 官方价格和你控制台中的实际账单为准', emphasis: 'DeepSeek 官方价格和你控制台中的实际账单为准', tone: 'sky' }
      ]
    },
    {
      title: '数据由你掌握',
      description: '平台不提供账户体系和云端学习数据托管，数据管理权保留在你的设备与浏览器中。',
      icon: ShieldCheck,
      iconTone: 'emerald',
      tips: [
        { text: '平台服务器不保存你的书籍、笔记、学习记录和 API Key', emphasis: '平台服务器不保存', tone: 'emerald' },
        { text: '书籍、笔记、学习记录和设置保存在当前浏览器本地', emphasis: '当前浏览器本地', tone: 'sky' },
        { text: '使用 AI 功能时，相关学习内容由浏览器直接发送给 DeepSeek', emphasis: '直接发送给 DeepSeek', tone: 'accent' },
        { text: '请自行妥善保管数据，并通过设置中的数据管理定期导出备份', emphasis: '自行妥善保管数据', tone: 'amber' },
        { text: '已有数据且距上次成功备份满 7 天时，系统会主动提醒再次备份', emphasis: '满 7 天时，系统会主动提醒', tone: 'emerald' }
      ]
    },
    {
      title: '完成设置，开始阅读',
      description: '配置 API Key、添加书籍、完成六阶段学习，再通过教学模拟和角色问答检验理解。',
      icon: Sparkles,
      iconTone: 'sky',
      tips: [
        { text: '第一步：在设置中填写 DeepSeek API Key，并确认 AI 数据传输授权', emphasis: '填写 DeepSeek API Key', tone: 'accent' },
        { text: '第二步：手动添加书籍，或上传文档自动提取书籍信息', emphasis: '添加书籍', tone: 'sky' },
        { text: '第三步：启动六阶段分析并依次完成阶段学习', emphasis: '六阶段分析', tone: 'emerald' },
        { text: '第四步：通过教学模拟和 3 道角色问答，完成一次费曼阅读闭环', emphasis: '费曼阅读闭环', tone: 'amber' }
      ]
    }
  ],
  en: [
    {
      title: 'Welcome to Feynman Reader',
      description: 'Bring reading, understanding, explanation, and review into one Feynman learning workflow.',
      icon: BookOpen,
      iconTone: 'accent',
      tips: [
        { text: 'Add books manually or upload PDF, DOCX, Markdown, TXT, and JSON documents', emphasis: 'Add books manually', tone: 'accent' },
        { text: 'Maintain complete book details including titles, authors, descriptions, covers, and tags', emphasis: 'complete book details', tone: 'sky' },
        { text: 'Search and filter by title, author, tag, status, and category', emphasis: 'Search and filter', tone: 'emerald' },
        { text: 'See phase progress and completed scores directly on the bookshelf', emphasis: 'phase progress and completed scores', tone: 'amber' }
      ]
    },
    {
      title: 'Six-Phase Deep Reading',
      description: 'DeepSeek V4 Flash analyzes each book across six implemented dimensions, with phase-by-phase saved results.',
      icon: BrainCircuit,
      iconTone: 'sky',
      tips: [
        { text: 'Background: author, writing context, and historical setting', emphasis: 'Background', tone: 'accent' },
        { text: 'Overview: core framework and whole-book understanding', emphasis: 'Overview', tone: 'sky' },
        { text: 'Deep Dive: core ideas, concepts, arguments, and examples', emphasis: 'Deep Dive', tone: 'emerald' },
        { text: 'Critical Analysis: boundaries, counterexamples, and debates', emphasis: 'Critical Analysis', tone: 'amber' },
        { text: 'Reception: reviews, influence, and alternative perspectives', emphasis: 'Reception', tone: 'accent' },
        { text: 'Synthesis: connect the book with prior knowledge and action', emphasis: 'Synthesis', tone: 'emerald' }
      ]
    },
    {
      title: 'Feynman Practice and Scoring',
      description: 'Explain the book in your own words, then answer persona questions. A final score appears only after both parts pass.',
      icon: GraduationCap,
      iconTone: 'emerald',
      tips: [
        { text: 'Teaching practice uses four scoring dimensions: accuracy, completeness, clarity, and overall quality', emphasis: 'four scoring dimensions', tone: 'sky' },
        { text: 'After teaching practice reaches 60, generate questions from 3 personas', emphasis: 'reaches 60', tone: 'emerald' },
        { text: 'Each persona answer is scored; unsuccessful attempts remain available for revision', emphasis: 'remain available for revision', tone: 'amber' },
        { text: 'The complete final score appears only after teaching and all 3 questions pass', emphasis: 'all 3 questions pass', tone: 'accent' }
      ]
    },
    {
      title: 'Notes, Organization, and Discovery',
      description: 'Keep a durable learning trail, organize your shelf, and continue into related reading.',
      icon: NotebookPen,
      iconTone: 'amber',
      tips: [
        { text: 'Reading notes are for your own records and are not scored by AI', emphasis: 'not scored by AI', tone: 'emerald' },
        { text: 'Teaching and persona Q&A records stay organized by book', emphasis: 'organized by book', tone: 'sky' },
        { text: 'Generate book tags with AI and manage tags and categories centrally', emphasis: 'Generate book tags with AI', tone: 'accent' },
        { text: 'After practice, get author, topic, and reading-path recommendations and add them to your shelf', emphasis: 'add them to your shelf', tone: 'amber' }
      ]
    },
    {
      title: 'DeepSeek V4 Flash and Cost',
      description: 'AI features use the DeepSeek API key you configure and the preset model selected by the app.',
      icon: WalletCards,
      iconTone: 'accent',
      tips: [
        { text: 'The preset model is DeepSeek V4 Flash', emphasis: 'DeepSeek V4 Flash', tone: 'accent' },
        { text: 'Using the complete AI workflow for one book is currently estimated at roughly CNY 0.02 for reference', emphasis: 'roughly CNY 0.02 for reference', tone: 'emerald' },
        { text: 'Actual cost varies with request count, input length, and parsed attachment characters', emphasis: 'Actual cost varies', tone: 'amber' },
        { text: 'Billing follows official DeepSeek pricing and the actual records in your console', emphasis: 'official DeepSeek pricing', tone: 'sky' }
      ]
    },
    {
      title: 'Your Data, Under Your Control',
      description: 'The platform provides no account-based cloud hosting for learning data; control remains with your device and browser.',
      icon: ShieldCheck,
      iconTone: 'emerald',
      tips: [
        { text: 'Platform servers do not store your books, notes, learning records, or API key', emphasis: 'do not store', tone: 'emerald' },
        { text: 'Books, notes, learning records, and settings remain in this browser', emphasis: 'in this browser', tone: 'sky' },
        { text: 'When using AI, relevant learning content is sent directly from the browser to DeepSeek', emphasis: 'directly from the browser to DeepSeek', tone: 'accent' },
        { text: 'Keep your data safely and export regular backups from Data Management', emphasis: 'Keep your data safely', tone: 'amber' },
        { text: 'The app provides a 7-day reminder after the last successful backup', emphasis: '7-day reminder', tone: 'emerald' }
      ]
    },
    {
      title: 'Finish Setup and Start Reading',
      description: 'Configure your API key, add a book, complete six-phase learning, and verify understanding through Feynman practice.',
      icon: Sparkles,
      iconTone: 'sky',
      tips: [
        { text: 'Step 1: Add your DeepSeek API key in Settings and confirm AI data transfer consent', emphasis: 'DeepSeek API key', tone: 'accent' },
        { text: 'Step 2: Add a book manually or upload a document for book-detail extraction', emphasis: 'Add a book', tone: 'sky' },
        { text: 'Step 3: Start six-phase analysis and complete each learning phase', emphasis: 'six-phase analysis', tone: 'emerald' },
        { text: 'Step 4: Pass teaching practice and 3 persona questions to complete the Feynman reading loop', emphasis: 'Feynman reading loop', tone: 'amber' }
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

export default function Onboarding({ lang, onComplete }: Props) {
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

  const steps = onboardingSteps[lang] || onboardingSteps.zh

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      // 完成新手引导
      localStorage.setItem(ONBOARDING_COMPLETED_KEY, ONBOARDING_VERSION)
      setShowTour(false)
      onComplete()
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
      <div className="card max-h-[90vh] w-full max-w-xl overflow-y-auto p-6 animate-fade-in md:p-8">
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
          <h2 className="text-2xl font-bold mb-3">{step.title}</h2>
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
        <div className="flex gap-3">
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
