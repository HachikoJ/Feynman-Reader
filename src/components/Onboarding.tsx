'use client'

import { useState, useEffect } from 'react'
import { Language } from '@/lib/i18n'

interface Props {
  lang: Language
  onComplete: () => void
}

// 引导步骤数据
const onboardingSteps = {
  zh: [
    {
      title: '👋 欢迎使用费曼阅读法',
      description: '这是一个基于费曼学习法的智能阅读工具，通过"以教代学"的方式帮助你深度理解每一本书。',
      icon: '📖',
      tips: [
        '阅读书籍并记录笔记',
        '用简单的语言复述内容',
        '通过AI评估你的理解程度',
        '制定实践计划巩固知识'
      ]
    },
    {
      title: '📚 六阶段深度阅读',
      description: '我们将阅读过程分为六个阶段，每个阶段都有特定的目标和评估方式：',
      icon: '🎯',
      tips: [
        '阶段1：选书与概览 - 了解书籍基本信息',
        '阶段2：核心概念 - 提炼关键术语和概念',
        '阶段3：结构分析 - 理解书籍框架结构',
        '阶段4：内容精读 - 深度阅读重要章节',
        '阶段5：教学模拟 - 用自己的话讲解内容',
        '阶段6：实践应用 - 将知识付诸实践'
      ]
    },
    {
      title: '🤖 AI 智能评估',
      description: '使用 DeepSeek AI 来评估你的理解和实践质量：',
      icon: '🤖',
      tips: [
        '在设置中配置你的 DeepSeek API Key',
        'AI 会根据费曼技巧评估你的笔记质量',
        '实践环节提供多维度评分反馈',
        '帮助你发现知识盲点，深化理解'
      ]
    },
    {
      title: '📝 使用建议',
      description: '为了获得最佳学习效果：',
      icon: '💡',
      tips: [
        '认真完成每个阶段的学习任务',
        '用自己的话复述，不要照抄原文',
        '定期回顾已读内容，巩固记忆',
        '将所学知识应用到实际生活中'
      ]
    },
    {
      title: '🚀 开始你的学习之旅',
      description: '现在你已经准备好了！点击下方按钮开始添加你的第一本书。',
      icon: '🎉',
      tips: [
        '可以手动添加书籍',
        '也可以上传文档自动解析',
        '数据安全存储在本地浏览器',
        '随时可以导出备份'
      ]
    }
  ],
  en: [
    {
      title: '👋 Welcome to Feynman Reading',
      description: 'An intelligent reading tool based on the Feynman Technique, helping you deeply understand every book through teaching.',
      icon: '📖',
      tips: [
        'Read books and take notes',
        'Explain content in simple words',
        'Get AI-powered understanding assessment',
        'Create practice plans to reinforce learning'
      ]
    },
    {
      title: '📚 Six-Phase Reading',
      description: 'We divide reading into six phases, each with specific goals and assessment methods:',
      icon: '🎯',
      tips: [
        'Phase 1: Selection & Overview',
        'Phase 2: Core Concepts',
        'Phase 3: Structure Analysis',
        'Phase 4: Deep Reading',
        'Phase 5: Teaching Simulation',
        'Phase 6: Practical Application'
      ]
    },
    {
      title: '🤖 AI Assessment',
      description: 'Use DeepSeek AI to evaluate your understanding and practice quality:',
      icon: '🤖',
      tips: [
        'Configure your DeepSeek API Key in settings',
        'AI evaluates your notes using Feynman technique',
        'Multi-dimensional scoring for practice',
        'Identify knowledge gaps and deepen understanding'
      ]
    },
    {
      title: '📝 Tips for Best Results',
      description: 'To get the most out of your learning:',
      icon: '💡',
      tips: [
        'Complete each phase seriously',
        'Use your own words, don\'t copy',
        'Review regularly to reinforce memory',
        'Apply knowledge to real life'
      ]
    },
    {
      title: '🚀 Start Your Journey',
      description: 'You\'re all set! Click below to add your first book.',
      icon: '🎉',
      tips: [
        'Add books manually',
        'Upload documents for auto-parsing',
        'Data stored securely in your browser',
        'Export backup anytime'
      ]
    }
  ]
}

export default function Onboarding({ lang, onComplete }: Props) {
  const [currentStep, setCurrentStep] = useState(0)
  const [showTour, setShowTour] = useState(true)

  // 检查是否已经完成过新手引导
  useEffect(() => {
    const hasCompleted = localStorage.getItem('feynman-onboarding-completed')
    if (hasCompleted) {
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
      localStorage.setItem('feynman-onboarding-completed', 'true')
      setShowTour(false)
      onComplete()
    }
  }

  const handleSkip = () => {
    localStorage.setItem('feynman-onboarding-completed', 'true')
    setShowTour(false)
    onComplete()
  }

  if (!showTour) return null

  const step = steps[currentStep]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="card max-w-lg w-full p-6 md:p-8 animate-fade-in">
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
          <div className="text-6xl mb-4">{step.icon}</div>
          <h2 className="text-2xl font-bold mb-3">{step.title}</h2>
          <p className="text-[var(--text-secondary)] mb-6">{step.description}</p>

          {/* 提示列表 */}
          <div className="text-left bg-[var(--bg-secondary)] rounded-xl p-4">
            {step.tips.map((tip, idx) => (
              <div key={idx} className="flex items-start gap-2 mb-2 last:mb-0">
                <span className="text-[var(--accent)] mt-0.5">✓</span>
                <span className="text-sm">{tip}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 按钮 */}
        <div className="flex gap-3">
          <button
            onClick={handleSkip}
            className="btn-secondary flex-1"
          >
            {lang === 'zh' ? '跳过' : 'Skip'}
          </button>
          <button
            onClick={handleNext}
            className="btn-primary flex-1"
          >
            {currentStep < steps.length - 1
              ? (lang === 'zh' ? '下一步' : 'Next')
              : (lang === 'zh' ? '开始使用' : 'Get Started')
            } →
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
