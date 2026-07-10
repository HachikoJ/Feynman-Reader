'use client'

import { useState, useEffect } from 'react'
import { Language } from '@/lib/i18n'
import {
  PERSONA_TYPES,
  getRecommendedPersonas,
  getSelectedPersonas,
  PersonaType
} from '@/lib/practiceEnhancement'

interface Props {
  lang: Language
  selectedIds?: string[]
  onSelectionChange?: (ids: string[]) => void
  maxSelect?: number
  compact?: boolean
}

export default function PersonaSelector({
  lang,
  selectedIds = [],
  onSelectionChange,
  maxSelect = 3,
  compact = false
}: Props) {
  const [internalSelection, setInternalSelection] = useState<string[]>([])
  const [preference, setPreference] = useState<'beginner' | 'balanced' | 'challenging'>('balanced')
  const [showCustom, setShowCustom] = useState(false)

  const selection = onSelectionChange ? selectedIds : internalSelection

  const handleToggle = (id: string) => {
    let newSelection: string[]

    if (selection.includes(id)) {
      newSelection = selection.filter(s => s !== id)
    } else {
      if (selection.length >= maxSelect) {
        // 已达到最大选择数量，不移除其他选项
        return
      }
      newSelection = [...selection, id]
    }

    if (onSelectionChange) {
      onSelectionChange(newSelection)
    } else {
      setInternalSelection(newSelection)
    }
  }

  const handleUseRecommended = () => {
    const recommended = getRecommendedPersonas(preference)
    const ids = recommended.slice(0, maxSelect).map(p => p.id)

    if (onSelectionChange) {
      onSelectionChange(ids)
    } else {
      setInternalSelection(ids)
    }
    setShowCustom(false)
  }

  const handleClearAll = () => {
    if (onSelectionChange) {
      onSelectionChange([])
    } else {
      setInternalSelection([])
    }
  }

  const selectedPersonas = getSelectedPersonas(selection)

  // 按类别分组
  const groupedPersonas: Record<string, PersonaType[]> = {
    beginner: PERSONA_TYPES.filter(p => p.category === 'beginner'),
    peer: PERSONA_TYPES.filter(p => p.category === 'peer'),
    critical: PERSONA_TYPES.filter(p => p.category === 'critical'),
    expert: PERSONA_TYPES.filter(p => p.category === 'expert')
  }

  const categoryNames: Record<string, { zh: string; en: string }> = {
    beginner: { zh: '初学者', en: 'Beginner' },
    peer: { zh: '同行者', en: 'Peer' },
    critical: { zh: '质疑者', en: 'Critical' },
    expert: { zh: '专家', en: 'Expert' }
  }

  const categoryIcons: Record<string, string> = {
    beginner: '🌱',
    peer: '🤝',
    critical: '🤔',
    expert: '🎓'
  }

  if (compact) {
    return (
      <div className="bg-[var(--bg-secondary)] rounded-xl p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">
            {lang === 'zh' ? '🎭 问答角色' : '🎭 Personas'}
          </span>
          <span className="text-xs text-[var(--text-secondary)]">
            {selection.length} / {maxSelect}
          </span>
        </div>

        {selectedPersonas.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {selectedPersonas.map(persona => (
              <span
                key={persona.id}
                className="inline-flex items-center gap-1 px-2 py-1 bg-[var(--accent)]/10 text-[var(--accent)] rounded text-xs"
              >
                {persona.icon} {persona.name[lang]}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-[var(--text-secondary)]">
            {lang === 'zh' ? '使用默认角色组合' : 'Using default personas'}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 快速选择 */}
      <div className="bg-[var(--bg-secondary)] rounded-xl p-4">
        <h4 className="font-semibold mb-3">
          {lang === 'zh' ? '🎯 快速选择' : '🎯 Quick Select'}
        </h4>

        <div className="grid grid-cols-3 gap-2 mb-3">
          {([
            { key: 'beginner', label: { zh: '简单', en: 'Easy' } },
            { key: 'balanced', label: { zh: '平衡', en: 'Balanced' } },
            { key: 'challenging', label: { zh: '挑战', en: 'Challenge' } }
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => {
                setPreference(key)
                const recommended = getRecommendedPersonas(key)
                const ids = recommended.slice(0, maxSelect).map(p => p.id)
                if (onSelectionChange) {
                  onSelectionChange(ids)
                } else {
                  setInternalSelection(ids)
                }
                setShowCustom(false)
              }}
              className={`p-3 rounded-lg border-2 transition-all text-center ${
                preference === key && !showCustom
                  ? 'border-[var(--accent)] bg-[var(--accent)]/10'
                  : 'border-[var(--border)] hover:border-[var(--accent)]/50'
              }`}
            >
              <div className="text-sm font-medium">{label[lang]}</div>
              <div className="text-xs text-[var(--text-secondary)] mt-1">
                {key === 'beginner' ? (lang === 'zh' ? '初学者+同行' : 'Beginner+Peer') :
                 key === 'balanced' ? (lang === 'zh' ? '混合搭配' : 'Mixed') :
                 (lang === 'zh' ? '质疑+专家' : 'Critical+Expert')}
              </div>
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <button
            onClick={() => setShowCustom(!showCustom)}
            className="text-sm text-[var(--accent)] hover:underline"
          >
            {showCustom ? (lang === 'zh' ? '隐藏自定义选项' : 'Hide custom') : (lang === 'zh' ? '自定义角色' : 'Custom personas')}
            {showCustom ? ' ▲' : ' ▼'}
          </button>

          {selection.length > 0 && (
            <button
              onClick={handleClearAll}
              className="text-sm text-red-400 hover:text-red-300"
            >
              {lang === 'zh' ? '清除选择' : 'Clear all'}
            </button>
          )}
        </div>
      </div>

      {/* 自定义选择 */}
      {showCustom && (
        <div className="card animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-semibold">
              {lang === 'zh' ? '⚙️ 自定义角色' : '⚙️ Custom Personas'}
            </h4>
            <span className="text-sm text-[var(--text-secondary)]">
              {selection.length} / {maxSelect}
            </span>
          </div>

          {(Object.entries(groupedPersonas) as [string, PersonaType[]][]).map(([category, personas]) => (
            <div key={category} className="mb-4 last:mb-0">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">{categoryIcons[category]}</span>
                <span className="text-sm font-medium">{categoryNames[category][lang]}</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {personas.map(persona => {
                  const isSelected = selection.includes(persona.id)
                  return (
                    <button
                      key={persona.id}
                      onClick={() => handleToggle(persona.id)}
                      disabled={!isSelected && selection.length >= maxSelect}
                      className={`p-3 rounded-lg border-2 transition-all text-left ${
                        isSelected
                          ? 'border-[var(--accent)] bg-[var(--accent)]/10'
                          : 'border-[var(--border)] hover:border-[var(--accent)]/50'
                      } ${!isSelected && selection.length >= maxSelect ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xl">{persona.icon}</span>
                        <span className="font-medium text-sm">{persona.name[lang]}</span>
                        {isSelected && (
                          <span className="ml-auto text-green-400">✓</span>
                        )}
                      </div>
                      <p className="text-xs text-[var(--text-secondary)]">
                        {persona.description[lang]}
                      </p>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          <div className="mt-4 flex gap-2">
            <button
              onClick={handleUseRecommended}
              className="btn-secondary flex-1"
            >
              {lang === 'zh' ? `使用推荐组合 (${preference === 'beginner' ? '简单' : preference === 'balanced' ? '平衡' : '挑战'})` : `Use recommended (${preference})`}
            </button>
          </div>
        </div>
      )}

      {/* 当前选择 */}
      {selectedPersonas.length > 0 && !showCustom && (
        <div className="bg-[var(--bg-secondary)] rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-sm">
              {lang === 'zh' ? '✓ 已选择' : '✓ Selected'}
            </h4>
            <button
              onClick={() => setShowCustom(true)}
              className="text-xs text-[var(--accent)] hover:underline"
            >
              {lang === 'zh' ? '修改' : 'Edit'}
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {selectedPersonas.map(persona => (
              <span
                key={persona.id}
                className="inline-flex items-center gap-2 px-3 py-2 bg-[var(--accent)]/10 text-[var(--accent)] rounded-lg"
              >
                <span className="text-lg">{persona.icon}</span>
                <span className="font-medium">{persona.name[lang]}</span>
              </span>
            ))}
          </div>

          <p className="text-xs text-[var(--text-secondary)] mt-3">
            {lang === 'zh'
              ? 'AI 将从以上角色的视角提出问题，帮助你全面理解书籍内容'
              : 'AI will ask questions from these perspectives to help you understand the book comprehensively'}
          </p>
        </div>
      )}
    </div>
  )
}

/**
 * 角色展示标签组件
 */
export function PersonaBadge({ personaId, lang }: { personaId: string; lang: Language }) {
  const persona = PERSONA_TYPES.find(p => p.id === personaId)

  if (!persona) return null

  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 bg-[var(--bg-secondary)] rounded text-xs">
      <span>{persona.icon}</span>
      <span>{persona.name[lang]}</span>
    </span>
  )
}
