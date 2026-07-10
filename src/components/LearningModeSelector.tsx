'use client'

import { useState, useEffect } from 'react'
import { Language, t } from '@/lib/i18n'
import {
  LearningMode,
  LEARNING_MODES,
  getDefaultPhaseCustomization,
  PhaseCustomization,
  detectBookCategory,
  BookCategory,
  CATEGORY_PHASE_CONFIGS
} from '@/lib/learningModes'
import { LEARNING_PHASES } from '@/lib/feynman-prompts'

interface Props {
  bookName: string
  bookDescription?: string
  lang: Language
  currentMode?: LearningMode
  onModeChange: (mode: LearningMode, customPhases?: PhaseCustomization[]) => void
}

export default function LearningModeSelector({
  bookName,
  bookDescription,
  lang,
  currentMode = 'sequential',
  onModeChange
}: Props) {
  const [selectedMode, setSelectedMode] = useState<LearningMode>(currentMode)
  const [showCustomEditor, setShowCustomEditor] = useState(false)
  const [customPhases, setCustomPhases] = useState<PhaseCustomization[]>(getDefaultPhaseCustomization())
  const [detectedCategory, setDetectedCategory] = useState<BookCategory>('other')

  useEffect(() => {
    setDetectedCategory(detectBookCategory(bookName, bookDescription))
  }, [bookName, bookDescription])

  const handleModeSelect = (mode: LearningMode) => {
    setSelectedMode(mode)

    if (mode === 'custom') {
      setShowCustomEditor(true)
    } else {
      setShowCustomEditor(false)
      onModeChange(mode)
    }
  }

  const handleCustomPhaseToggle = (phaseId: string) => {
    setCustomPhases(prev =>
      prev.map(p =>
        p.phaseId === phaseId ? { ...p, enabled: !p.enabled } : p
      )
    )
  }

  const handleApplyCustom = () => {
    onModeChange('custom', customPhases.filter(p => p.enabled))
    setShowCustomEditor(false)
  }

  const handleUseCategoryRecommended = () => {
    const config = CATEGORY_PHASE_CONFIGS[detectedCategory]
    const recommended = new Set(config.recommendedPhases)

    setCustomPhases(prev =>
      prev.map(p => ({
        ...p,
        enabled: recommended.has(p.phaseId)
      }))
    )
  }

  const selectedModeConfig = LEARNING_MODES[selectedMode]
  const categoryConfig = CATEGORY_PHASE_CONFIGS[detectedCategory]

  return (
    <div className="space-y-6">
      {/* 学习模式选择 */}
      <div className="card">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <span className="text-xl">📖</span>
          <span>{lang === 'zh' ? '选择学习模式' : 'Choose Learning Mode'}</span>
        </h3>

        {/* 检测到的书籍类型 */}
        {detectedCategory !== 'other' && (
          <div className="mb-4 p-3 bg-[var(--accent)]/10 border border-[var(--accent)]/30 rounded-xl">
            <p className="text-sm">
              <span className="text-[var(--accent)]">{lang === 'zh' ? '检测到书籍类型' : 'Detected Category'}:</span>
              <span className="ml-2 font-medium">{categoryConfig.name[lang]}</span>
            </p>
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              {lang === 'zh'
                ? `推荐阶段：${categoryConfig.recommendedPhases.map(id => t(lang, `phases.${id}.subtitle`)).join('、')}`
                : `Recommended: ${categoryConfig.recommendedPhases.map(id => t(lang, `phases.${id}.subtitle`)).join(', ')}`
              }
            </p>
          </div>
        )}

        {/* 模式选项 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(Object.entries(LEARNING_MODES) as [LearningMode, typeof LEARNING_MODES[LearningMode]][]).map(([modeId, config]) => (
            <button
              key={modeId}
              onClick={() => handleModeSelect(modeId)}
              className={`p-4 rounded-xl border-2 transition-all text-left ${
                selectedMode === modeId
                  ? 'border-[var(--accent)] bg-[var(--accent)]/10'
                  : 'border-[var(--border)] hover:border-[var(--accent)]/50 bg-[var(--bg-secondary)]'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">{config.icon}</span>
                <span className="font-semibold">{config.name[lang]}</span>
              </div>
              <p className="text-sm text-[var(--text-secondary)]">{config.description[lang]}</p>
              <div className="mt-2 flex items-center gap-2 text-xs">
                <span className={config.allowSkip ? 'text-green-400' : 'text-yellow-400'}>
                  {config.allowSkip
                    ? (lang === 'zh' ? '✓ 可跳过阶段' : '✓ Can skip')
                    : (lang === 'zh' ? '○ 顺序完成' : '○ Sequential')
                  }
                </span>
                <span className="text-[var(--text-secondary)]">
                  {config.phases.length > 0
                    ? `${config.phases.length} ${lang === 'zh' ? '个阶段' : 'phases'}`
                    : (lang === 'zh' ? '自定义阶段' : 'Custom phases')
                  }
                </span>
              </div>
            </button>
          ))}
        </div>

        {/* 当前选择的模式信息 */}
        {selectedMode !== 'custom' && (
          <div className="mt-4 p-3 bg-[var(--bg-secondary)] rounded-xl">
            <p className="text-sm text-[var(--text-secondary)]">
              <span className="font-medium text-[var(--text-primary)]">
                {lang === 'zh' ? '已选择：' : 'Selected: '}
              </span>
              {selectedModeConfig.icon} {selectedModeConfig.name[lang]}
            </p>
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              {selectedModeConfig.phases.map(id => t(lang, `phases.${id}.subtitle`)).join(' → ')}
            </p>
          </div>
        )}
      </div>

      {/* 自定义模式编辑器 */}
      {showCustomEditor && (
        <div className="card animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold flex items-center gap-2">
              <span className="text-xl">⚙️</span>
              <span>{lang === 'zh' ? '自定义学习阶段' : 'Customize Phases'}</span>
            </h3>

            {/* 使用推荐的阶段 */}
            {detectedCategory !== 'other' && (
              <button
                onClick={handleUseCategoryRecommended}
                className="text-sm px-3 py-1 rounded-lg bg-[var(--accent)]/20 text-[var(--accent)] hover:bg-[var(--accent)]/30 transition-colors"
              >
                {lang === 'zh' ? `使用${categoryConfig.name.zh}推荐` : `Use ${categoryConfig.name.en} recommendation`}
              </button>
            )}
          </div>

          <p className="text-sm text-[var(--text-secondary)] mb-4">
            {lang === 'zh'
              ? '选择你想学习的阶段，可以拖拽调整顺序'
              : 'Select the phases you want to study, drag to reorder'}
          </p>

          <div className="space-y-2">
            {customPhases
              .sort((a, b) => a.order - b.order)
              .map((phaseCustom) => {
                const phase = LEARNING_PHASES.find(p => p.id === phaseCustom.phaseId)!
                const isEmphasized = categoryConfig.emphasis.includes(phaseCustom.phaseId)

                return (
                  <div
                    key={phaseCustom.phaseId}
                    className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${
                      phaseCustom.enabled
                        ? isEmphasized
                          ? 'border-[var(--accent)] bg-[var(--accent)]/5'
                          : 'border-[var(--border)] bg-[var(--bg-secondary)]'
                        : 'border-dashed border-[var(--border)] opacity-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={phaseCustom.enabled}
                      onChange={() => handleCustomPhaseToggle(phaseCustom.phaseId)}
                      className="w-5 h-5"
                    />

                    <span className="text-2xl">{phase.icon}</span>

                    <div className="flex-1">
                      <p className="font-medium">{t(lang, `phases.${phaseCustom.phaseId}.title`)}</p>
                      <p className="text-sm text-[var(--text-secondary)]">
                        {t(lang, `phases.${phaseCustom.phaseId}.subtitle`)}
                      </p>
                    </div>

                    {isEmphasized && (
                      <span className="text-xs px-2 py-1 rounded bg-[var(--accent)]/20 text-[var(--accent)]">
                        {lang === 'zh' ? '推荐' : 'Recommended'}
                      </span>
                    )}
                  </div>
                )
              })}
          </div>

          {/* 预览 */}
          {customPhases.filter(p => p.enabled).length > 0 && (
            <div className="mt-4 p-3 bg-[var(--bg-secondary)] rounded-xl">
              <p className="text-xs text-[var(--text-secondary)] mb-2">
                {lang === 'zh' ? '学习路径：' : 'Learning Path:'}
              </p>
              <div className="flex flex-wrap gap-2">
                {customPhases
                  .filter(p => p.enabled)
                  .sort((a, b) => a.order - b.order)
                  .map((p, idx) => {
                    const phase = LEARNING_PHASES.find(ph => ph.id === p.phaseId)!
                    return (
                      <span key={p.phaseId} className="text-sm flex items-center gap-1">
                        {phase.icon} {t(lang, `phases.${p.phaseId}.subtitle`)}
                        {idx < customPhases.filter(cp => cp.enabled).length - 1 && ' → '}
                      </span>
                    )
                  })}
              </div>
            </div>
          )}

          <div className="mt-4 flex gap-2">
            <button
              onClick={handleApplyCustom}
              disabled={customPhases.filter(p => p.enabled).length === 0}
              className="btn-primary flex-1"
            >
              {lang === 'zh' ? `应用自定义模式 (${customPhases.filter(p => p.enabled).length}个阶段)` : `Apply (${customPhases.filter(p => p.enabled).length} phases)`}
            </button>
            <button
              onClick={() => setShowCustomEditor(false)}
              className="btn-secondary"
            >
              {lang === 'zh' ? '取消' : 'Cancel'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
