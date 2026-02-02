'use client'

import { useState, useEffect } from 'react'
import { Language } from '@/lib/i18n'
import { PRACTICE_TEMPLATES, PracticeTemplate } from '@/lib/practiceEnhancement'

interface Props {
  lang: Language
  bookName: string
  onSelectTemplate: (template: PracticeTemplate) => void
  currentStep?: number
  onStepChange?: (step: number) => void
  className?: string
}

export default function ProgressivePractice({
  lang,
  bookName,
  onSelectTemplate,
  currentStep = 0,
  onStepChange,
  className = ''
}: Props) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('beginner')
  const [currentStepIndex, setCurrentStepIndex] = useState(currentStep)

  useEffect(() => {
    setCurrentStepIndex(currentStep)
  }, [currentStep])

  const selectedTemplate = PRACTICE_TEMPLATES.find(t => t.id === selectedTemplateId) || PRACTICE_TEMPLATES[0]
  const currentStepData = selectedTemplate.steps[currentStepIndex]

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId)
    setCurrentStepIndex(0)
    onSelectTemplate(PRACTICE_TEMPLATES.find(t => t.id === templateId)!)
  }

  const handleNextStep = () => {
    if (currentStepIndex < selectedTemplate.steps.length - 1) {
      const nextStep = currentStepIndex + 1
      setCurrentStepIndex(nextStep)
      onStepChange?.(nextStep)
    }
  }

  const handlePrevStep = () => {
    if (currentStepIndex > 0) {
      const prevStep = currentStepIndex - 1
      setCurrentStepIndex(prevStep)
      onStepChange?.(prevStep)
    }
  }

  const getStepTemplate = (): string => {
    if (!currentStepData) return ''
    return currentStepData.template[lang]
      .replace('BOOK_NAME', bookName)
      .replace('《BOOK_NAME》', lang === 'zh' ? `《${bookName}》` : `"${bookName}"`)
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* 模板选择 */}
      <div className="bg-[var(--bg-secondary)] rounded-xl p-4">
        <h4 className="font-semibold mb-3">
          {lang === 'zh' ? '📚 选择练习模式' : '📚 Choose Practice Mode'}
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {PRACTICE_TEMPLATES.map(template => (
            <button
              key={template.id}
              onClick={() => handleTemplateSelect(template.id)}
              className={`p-3 rounded-lg border-2 transition-all text-left ${
                selectedTemplateId === template.id
                  ? 'border-[var(--accent)] bg-[var(--accent)]/10'
                  : 'border-[var(--border)] hover:border-[var(--accent)]/50'
              }`}
            >
              <div className="font-medium text-sm">{template.name[lang]}</div>
              <div className="text-xs text-[var(--text-secondary)] mt-1">{template.description[lang]}</div>
              <div className="text-xs text-[var(--accent)] mt-2">
                {template.steps.length} {lang === 'zh' ? '步骤' : 'steps'}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 当前步骤指导 */}
      {currentStepData && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-semibold">
              {currentStepData.title[lang]}
            </h4>
            <div className="text-sm text-[var(--text-secondary)]">
              {currentStepIndex + 1} / {selectedTemplate.steps.length}
            </div>
          </div>

          {/* 步骤进度条 */}
          <div className="flex gap-1 mb-4">
            {selectedTemplate.steps.map((_, idx) => (
              <div
                key={idx}
                className={`flex-1 h-1.5 rounded-full ${
                  idx < currentStepIndex ? 'bg-green-500' :
                  idx === currentStepIndex ? 'bg-[var(--accent)]' :
                  'bg-[var(--border)]'
                }`}
              />
            ))}
          </div>

          {/* 步骤指导 */}
          <div className="bg-[var(--bg-secondary)] rounded-lg p-4 mb-4">
            <div className="flex items-start gap-2">
              <span className="text-2xl">💡</span>
              <div>
                <div className="font-medium text-[var(--accent)] mb-1">
                  {lang === 'zh' ? '本步骤指导' : 'Step Guidance'}
                </div>
                <p className="text-sm text-[var(--text-secondary)]">
                  {currentStepData.guidance[lang]}
                </p>
              </div>
            </div>
          </div>

          {/* 字数提示 */}
          <div className="flex items-center gap-4 text-xs text-[var(--text-secondary)] mb-4">
            <span>
              {lang === 'zh' ? '最少：' : 'Min: '}
              <span className="font-medium">{currentStepData.minChars}</span> {lang === 'zh' ? '字' : 'chars'}
            </span>
            <span>
              {lang === 'zh' ? '推荐：' : 'Target: '}
              <span className="font-medium">{currentStepData.targetChars}</span> {lang === 'zh' ? '字' : 'chars'}
            </span>
          </div>

          {/* 模板提示 */}
          {getStepTemplate() && (
            <div className="bg-[var(--accent)]/5 border border-[var(--accent)]/20 rounded-lg p-3 mb-4">
              <div className="text-xs text-[var(--accent)] mb-2">
                {lang === 'zh' ? '📝 可以参考以下模板：' : '📝 Template reference:'}
              </div>
              <pre className="text-sm whitespace-pre-wrap font-sans text-[var(--text-secondary)]">
                {getStepTemplate()}
              </pre>
            </div>
          )}

          {/* 导航按钮 */}
          <div className="flex gap-2">
            {currentStepIndex > 0 && (
              <button
                onClick={handlePrevStep}
                className="btn-secondary flex-1"
              >
                {lang === 'zh' ? '← 上一步' : '← Previous'}
              </button>
            )}
            {currentStepIndex < selectedTemplate.steps.length - 1 ? (
              <button
                onClick={handleNextStep}
                className="btn-primary flex-1"
              >
                {lang === 'zh' ? '下一步 →' : 'Next →'}
              </button>
            ) : (
              <button
                onClick={handleNextStep}
                className="btn-primary flex-1 bg-green-600 hover:bg-green-700"
              >
                {lang === 'zh' ? '✓ 完成练习' : '✓ Complete'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * 字数统计组件
 */
export function CharCounter({ current, min, target, lang }: { current: number; min: number; target: number; lang: Language }) {
  const getPercentage = () => {
    if (target === 0) return 100
    return Math.min((current / target) * 100, 100)
  }

  const getStatus = () => {
    if (current < min) return 'warning'
    if (current < target) return 'progress'
    return 'complete'
  }

  const status = getStatus()

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 bg-[var(--border)] rounded-full overflow-hidden">
        <div
          className={`h-full transition-all ${
            status === 'complete' ? 'bg-green-500' :
            status === 'progress' ? 'bg-[var(--accent)]' :
            'bg-yellow-500'
          }`}
          style={{ width: `${getPercentage()}%` }}
        />
      </div>
      <span className={`text-xs font-medium ${
        status === 'complete' ? 'text-green-400' :
        status === 'progress' ? 'text-[var(--accent)]' :
        'text-yellow-400'
      }`}>
        {current} / {target}
      </span>
    </div>
  )
}
