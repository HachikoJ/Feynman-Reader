'use client'

import { useState } from 'react'
import { Language } from '@/lib/i18n'
import { SCORING_CRITERIA, getScoringExplanation } from '@/lib/practiceEnhancement'
import MarkdownRenderer from './MarkdownRenderer'

interface Props {
  lang: Language
  compact?: boolean
}

export default function ScoringCriteriaDisplay({ lang, compact = false }: Props) {
  const [expandedDimension, setExpandedDimension] = useState<string | null>(null)
  const [showFullGuide, setShowFullGuide] = useState(false)

  if (compact) {
    return (
      <div className="bg-[var(--bg-secondary)] rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold text-sm">
            {lang === 'zh' ? '📊 评分标准' : '📊 Scoring Criteria'}
          </h4>
          <button
            onClick={() => setShowFullGuide(!showFullGuide)}
            className="text-xs text-[var(--accent)] hover:underline"
          >
            {showFullGuide ? (lang === 'zh' ? '收起' : 'Hide') : (lang === 'zh' ? '查看详情' : 'View Details')}
          </button>
        </div>

        {!showFullGuide ? (
          <div className="grid grid-cols-3 gap-2 text-xs">
            {(Object.keys(SCORING_CRITERIA) as Array<keyof typeof SCORING_CRITERIA>).map(dim => {
              const criteria = SCORING_CRITERIA[dim]
              return (
                <div key={dim} className="text-center p-2 bg-[var(--bg-card)] rounded-lg">
                  <div className="font-medium text-[var(--accent)]">{criteria.name[lang]}</div>
                  <div className="text-[var(--text-secondary)] mt-1">{criteria.description[lang]}</div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="space-y-3">
            {(Object.entries(SCORING_CRITERIA) as [string, typeof SCORING_CRITERIA[keyof typeof SCORING_CRITERIA]][]).map(([key, criteria]) => (
              <div key={key} className="bg-[var(--bg-card)] rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <h5 className="font-medium">{criteria.name[lang]}</h5>
                  <span className="text-xs text-[var(--text-secondary)]">{criteria.description[lang]}</span>
                </div>
                <div className="space-y-1 text-xs">
                  {criteria.levels.map((level, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <span className={`px-1.5 py-0.5 rounded text-white text-xs ${
                        level.range[1] >= 85 ? 'bg-green-500' :
                        level.range[1] >= 70 ? 'bg-blue-500' :
                        level.range[1] >= 50 ? 'bg-yellow-500' :
                        'bg-red-500'
                      }`}>
                        {level.range[0]}-{level.range[1]}
                      </span>
                      <span className="text-[var(--text-secondary)]">{level.label[lang]}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-2 p-2 bg-[var(--accent)]/10 rounded text-xs text-[var(--accent)]">
                  💡 {criteria.tips[lang]}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold">
          {lang === 'zh' ? '📊 评分标准' : '📊 Scoring Criteria'}
        </h3>
        <button
          onClick={() => setShowFullGuide(!showFullGuide)}
          className="text-sm text-[var(--accent)] hover:underline"
        >
          {showFullGuide ? (lang === 'zh' ? '收起完整指南' : 'Hide Full Guide') : (lang === 'zh' ? '查看完整指南' : 'View Full Guide')}
        </button>
      </div>

      {showFullGuide ? (
        <div className="prose prose-sm max-w-none">
          <MarkdownRenderer content={getScoringExplanation(lang)} />
        </div>
      ) : (
        <div className="space-y-4">
          {/* 及格规则 */}
          <div className="bg-[var(--bg-secondary)] rounded-xl p-4">
            <h4 className="font-semibold mb-3">
              {lang === 'zh' ? '🎯 通过标准' : '🎯 Passing Standards'}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-center">
                <div className="text-green-400 font-bold text-lg">60+</div>
                <div className="text-[var(--text-secondary)]">{lang === 'zh' ? '及格线' : 'Passing Score'}</div>
              </div>
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 text-center">
                <div className="text-yellow-400 font-bold text-lg">&lt;40</div>
                <div className="text-[var(--text-secondary)]">{lang === 'zh' ? '任一维度≤50分' : 'Any dim ≤50'}</div>
              </div>
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-center">
                <div className="text-red-400 font-bold text-lg">&lt;50</div>
                <div className="text-[var(--text-secondary)]">{lang === 'zh' ? '任一维度≤60分' : 'Any dim ≤60'}</div>
              </div>
            </div>
          </div>

          {/* 三维度展开卡片 */}
          <div className="space-y-3">
            {(Object.entries(SCORING_CRITERIA) as [string, typeof SCORING_CRITERIA[keyof typeof SCORING_CRITERIA]][]).map(([key, criteria]) => (
              <div key={key} className="bg-[var(--bg-secondary)] rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpandedDimension(expandedDimension === key ? null : key)}
                  className="w-full p-4 flex items-center justify-between hover:bg-[var(--bg-card)] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${
                      criteria.dimension === 'accuracy' ? 'bg-blue-500/20 text-blue-400' :
                      criteria.dimension === 'completeness' ? 'bg-green-500/20 text-green-400' :
                      'bg-purple-500/20 text-purple-400'
                    }`}>
                      {criteria.dimension === 'accuracy' ? '🎯' :
                       criteria.dimension === 'completeness' ? '📝' : '💬'}
                    </span>
                    <div className="text-left">
                      <div className="font-semibold">{criteria.name[lang]}</div>
                      <div className="text-sm text-[var(--text-secondary)]">{criteria.description[lang]}</div>
                    </div>
                  </div>
                  <span className={`text-[var(--text-secondary)] transition-transform ${
                    expandedDimension === key ? 'rotate-180' : ''
                  }`}>
                    ▼
                  </span>
                </button>

                {expandedDimension === key && (
                  <div className="p-4 pt-0 border-t border-[var(--border)] animate-fade-in">
                    {/* 分数等级 */}
                    <div className="space-y-2 mb-4">
                      {criteria.levels.map((level, idx) => (
                        <div
                          key={idx}
                          className={`p-3 rounded-lg border-2 ${
                            level.range[1] >= 85 ? 'border-green-500/30 bg-green-500/5' :
                            level.range[1] >= 70 ? 'border-blue-500/30 bg-blue-500/5' :
                            level.range[1] >= 50 ? 'border-yellow-500/30 bg-yellow-500/5' :
                            'border-red-500/30 bg-red-500/5'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              level.range[1] >= 85 ? 'bg-green-500 text-white' :
                              level.range[1] >= 70 ? 'bg-blue-500 text-white' :
                              level.range[1] >= 50 ? 'bg-yellow-500 text-white' :
                              'bg-red-500 text-white'
                            }`}>
                              {level.range[0]}-{level.range[1]}
                            </span>
                            <span className="font-medium">{level.label[lang]}</span>
                          </div>
                          <p className="text-sm text-[var(--text-secondary)]">{level.description[lang]}</p>
                          <p className="text-xs text-[var(--text-secondary)] mt-1 italic">
                            {lang === 'zh' ? '例如：' : 'e.g., '}{level.example[lang]}
                          </p>
                        </div>
                      ))}
                    </div>

                    {/* 提分建议 */}
                    <div className="bg-[var(--accent)]/10 border border-[var(--accent)]/30 rounded-lg p-3">
                      <div className="flex items-start gap-2">
                        <span>💡</span>
                        <div>
                          <div className="font-medium text-[var(--accent)]">
                            {lang === 'zh' ? '提分建议' : 'Improvement Tips'}
                          </div>
                          <p className="text-sm text-[var(--text-secondary)] mt-1">{criteria.tips[lang]}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
