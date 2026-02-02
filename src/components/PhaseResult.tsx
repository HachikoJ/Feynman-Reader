'use client'

import { useState, useMemo } from 'react'
import { Language } from '@/lib/i18n'
import MarkdownRenderer from './MarkdownRenderer'

interface Props {
  content: string
  lang: Language
}

interface Section {
  title: string
  content: string
  isKeyPoint: boolean
}

export default function PhaseResult({ content, lang }: Props) {
  const parseContent = (text: string): Section[] => {
    const sections: Section[] = []
    const lines = text.split('\n')
    let currentTitle = ''
    let currentContent: string[] = []

    for (const line of lines) {
      if (line.startsWith('## ')) {
        if (currentTitle) {
          sections.push({
            title: currentTitle,
            content: currentContent.join('\n').trim(),
            isKeyPoint: currentTitle.includes('核心要点') || currentTitle.toLowerCase().includes('key point')
          })
        }
        currentTitle = line.replace('## ', '').trim()
        currentContent = []
      } else {
        currentContent.push(line)
      }
    }
    
    if (currentTitle) {
      sections.push({
        title: currentTitle,
        content: currentContent.join('\n').trim(),
        isKeyPoint: currentTitle.includes('核心要点') || currentTitle.toLowerCase().includes('key point')
      })
    }

    if (sections.length === 0) {
      sections.push({
        title: lang === 'zh' ? '分析结果' : 'Analysis Result',
        content: text,
        isKeyPoint: false
      })
    }

    return sections
  }

  const sections = useMemo(() => parseContent(content), [content, lang])
  
  // 初始化：只展开核心要点
  const getInitialExpandedState = () => {
    const initial: Record<number, boolean> = {}
    sections.forEach((section, idx) => {
      initial[idx] = section.isKeyPoint
    })
    return initial
  }
  
  const [expandedSections, setExpandedSections] = useState<Record<number, boolean>>(getInitialExpandedState)

  const toggleSection = (idx: number) => {
    setExpandedSections(prev => ({ ...prev, [idx]: !prev[idx] }))
  }

  const expandAll = () => {
    const all: Record<number, boolean> = {}
    sections.forEach((_, idx) => { all[idx] = true })
    setExpandedSections(all)
  }

  const collapseAll = () => {
    const initial: Record<number, boolean> = {}
    sections.forEach((section, idx) => {
      initial[idx] = section.isKeyPoint
    })
    setExpandedSections(initial)
  }

  return (
    <div className="space-y-4">
      {sections.map((section, idx) => {
        const isExpanded = expandedSections[idx] ?? false

        return (
          <div
            key={idx}
            className={`rounded-2xl overflow-hidden transition-all ${
              section.isKeyPoint
                ? 'bg-gradient-to-br from-[var(--accent)]/15 via-[var(--accent)]/5 to-transparent border-2 border-[var(--accent)]/40 shadow-lg shadow-[var(--accent)]/10'
                : 'bg-[var(--bg-secondary)] border border-[var(--border)]'
            }`}
          >
            <button
              onClick={() => toggleSection(idx)}
              className={`w-full flex items-center justify-between p-4 text-left transition-colors ${
                section.isKeyPoint ? 'hover:bg-[var(--accent)]/10' : 'hover:bg-[var(--border)]/30'
              }`}
            >
              <div className="flex items-center gap-3">
                {section.isKeyPoint && (
                  <span className="flex items-center justify-center w-9 h-9 rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-secondary)] text-white text-lg shadow-lg">
                    💡
                  </span>
                )}
                <span className={`font-semibold ${section.isKeyPoint ? 'text-[var(--accent)] text-lg' : 'text-[var(--text-primary)]'}`}>
                  {section.title}
                </span>
              </div>
              <span className={`text-sm text-[var(--text-secondary)] transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                ▼
              </span>
            </button>

            {isExpanded && (
              <div className={`px-5 pb-5 ${section.isKeyPoint ? 'px-6' : ''}`}>
                {section.isKeyPoint && (
                  <div className="h-px bg-gradient-to-r from-[var(--accent)]/50 via-[var(--accent)]/20 to-transparent mb-4" />
                )}
                <MarkdownRenderer 
                  content={section.content} 
                  className={section.isKeyPoint ? 'text-[var(--text-primary)]' : ''}
                />
              </div>
            )}
          </div>
        )
      })}

      {sections.length > 1 && (
        <div className="flex justify-center gap-4 pt-2">
          <button onClick={expandAll} className="text-sm text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors">
            {lang === 'zh' ? '📖 展开全部' : '📖 Expand All'}
          </button>
          <span className="text-[var(--border)]">|</span>
          <button onClick={collapseAll} className="text-sm text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors">
            {lang === 'zh' ? '📕 收起全部' : '📕 Collapse All'}
          </button>
        </div>
      )}
    </div>
  )
}
