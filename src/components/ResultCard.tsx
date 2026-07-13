'use client'

import { useState } from 'react'
import { Language, t } from '@/lib/i18n'
import AppIcon from './AppIcon'

interface Props {
  content: string
  lang: Language
}

// 将 markdown 文本转换为格式化的 React 元素
function formatText(text: string): React.ReactNode[] {
  const lines = text.split('\n')
  const result: React.ReactNode[] = []
  
  lines.forEach((line, lineIdx) => {
    // 移除 markdown 标题符号，转为加粗
    if (line.startsWith('## ') || line.startsWith('### ')) {
      const content = line.replace(/^#{2,3}\s*/, '')
      result.push(
        <p key={lineIdx} className="font-bold text-[var(--text-primary)] mt-4 mb-2 text-lg">
          {formatInlineText(content)}
        </p>
      )
      return
    }
    
    // 列表项
    if (line.trim().startsWith('- ') || line.trim().startsWith('• ') || line.trim().match(/^\d+\.\s/)) {
      const content = line.replace(/^\s*[-•]\s*/, '').replace(/^\s*\d+\.\s*/, '')
      result.push(
        <div key={lineIdx} className="flex gap-2 my-1 ml-2">
          <span className="text-[var(--accent)]">•</span>
          <span>{formatInlineText(content)}</span>
        </div>
      )
      return
    }
    
    // 空行
    if (!line.trim()) {
      result.push(<div key={lineIdx} className="h-2" />)
      return
    }
    
    // 普通段落
    result.push(
      <p key={lineIdx} className="my-1 leading-relaxed">
        {formatInlineText(line)}
      </p>
    )
  })
  
  return result
}

// 处理行内格式：加粗、斜体等
function formatInlineText(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  let remaining = text
  let key = 0
  
  while (remaining.length > 0) {
    // 匹配加粗 **text** 或 __text__
    const boldMatch = remaining.match(/\*\*(.+?)\*\*|__(.+?)__/)
    // 匹配斜体 *text* 或 _text_
    const italicMatch = remaining.match(/(?<!\*)\*([^*]+?)\*(?!\*)|(?<!_)_([^_]+?)_(?!_)/)
    // 匹配行内代码 `code`
    const codeMatch = remaining.match(/`([^`]+?)`/)
    
    // 找到最早出现的匹配
    const matches = [
      boldMatch ? { type: 'bold', match: boldMatch, index: boldMatch.index! } : null,
      italicMatch ? { type: 'italic', match: italicMatch, index: italicMatch.index! } : null,
      codeMatch ? { type: 'code', match: codeMatch, index: codeMatch.index! } : null,
    ].filter(Boolean).sort((a, b) => a!.index - b!.index)
    
    if (matches.length === 0) {
      parts.push(<span key={key++}>{remaining}</span>)
      break
    }
    
    const first = matches[0]!
    
    // 添加匹配前的文本
    if (first.index > 0) {
      parts.push(<span key={key++}>{remaining.slice(0, first.index)}</span>)
    }
    
    // 添加格式化的文本
    const content = first.match[1] || first.match[2]
    if (first.type === 'bold') {
      parts.push(<strong key={key++} className="font-semibold text-[var(--text-primary)]">{content}</strong>)
    } else if (first.type === 'italic') {
      parts.push(<em key={key++} className="italic">{content}</em>)
    } else if (first.type === 'code') {
      parts.push(
        <code key={key++} className="px-1.5 py-0.5 bg-[var(--bg-secondary)] rounded text-[var(--accent)] text-sm">
          {content}
        </code>
      )
    }
    
    remaining = remaining.slice(first.index + first.match[0].length)
  }
  
  return parts
}

export default function ResultCard({ content, lang }: Props) {
  const [expanded, setExpanded] = useState(true)

  // 解析结构化响应
  const parseContent = (text: string) => {
    const sections: { type: 'summary' | 'insights' | 'details'; title: string; content: string }[] = []
    
    // 尝试提取结构化部分
    const summaryMatch = text.match(/##\s*(核心要点|Key Points)/i)
    const insightsMatch = text.match(/##\s*(关键洞察|Key Insights)/i)
    const detailsMatch = text.match(/##\s*(详细分析|Detailed Analysis)/i)

    if (summaryMatch && insightsMatch) {
      const summaryStart = text.indexOf(summaryMatch[0])
      const insightsStart = text.indexOf(insightsMatch[0])
      const detailsStart = detailsMatch ? text.indexOf(detailsMatch[0]) : text.length

      sections.push({
        type: 'summary',
        title: summaryMatch[1],
        content: text.slice(summaryStart + summaryMatch[0].length, insightsStart).trim()
      })
      sections.push({
        type: 'insights',
        title: insightsMatch[1],
        content: text.slice(insightsStart + insightsMatch[0].length, detailsStart).trim()
      })
      if (detailsMatch) {
        sections.push({
          type: 'details',
          title: detailsMatch[1],
          content: text.slice(detailsStart + detailsMatch[0].length).trim()
        })
      }
    } else {
      // 回退：整个内容作为详情
      sections.push({ type: 'details', title: '', content: text })
    }

    return sections
  }

  const sections = parseContent(content)
  const summarySection = sections.find(s => s.type === 'summary')
  const insightsSection = sections.find(s => s.type === 'insights')
  const detailsSection = sections.find(s => s.type === 'details')

  // 解析洞察列表
  const parseInsights = (text: string) => {
    const lines = text.split('\n').filter(line => 
      line.trim().startsWith('-') || line.trim().startsWith('•') || line.trim().match(/^\d+\./)
    )
    return lines.map(line => 
      line.replace(/^[-•]\s*/, '').replace(/^\d+\.\s*/, '').replace(/\*\*/g, '').trim()
    )
  }

  const insights = insightsSection ? parseInsights(insightsSection.content) : []
  const hasStructure = summarySection || insights.length > 0

  return (
    <div className="space-y-4 animate-fade-in">
      {/* 核心要点 - 始终可见，高亮显示 */}
      {summarySection && (
        <div className="result-card">
          <div className="result-header flex items-center gap-2">
            <AppIcon name="lightbulb" tone="amber" size={18} />
            <span>{summarySection.title}</span>
          </div>
          <div className="result-body">
            <div className="text-lg leading-relaxed">{formatText(summarySection.content)}</div>
          </div>
        </div>
      )}

      {/* 关键洞察 - 可视化列表 */}
      {insights.length > 0 && (
        <div className="card">
          <h4 className="font-semibold mb-4 flex items-center gap-2">
            <AppIcon name="target" tone="green" size={18} />
            {insightsSection?.title || t(lang, 'result.keyInsights')}
          </h4>
          <div className="space-y-2">
            {insights.map((insight, idx) => (
              <div key={idx} className="insight-item">
                <div className="insight-icon">{idx + 1}</div>
                <p>{formatInlineText(insight)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 详细分析 - 可折叠 */}
      {detailsSection && detailsSection.content && (
        <div className="card">
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-between"
          >
            <h4 className="font-semibold flex items-center gap-2">
              <AppIcon name="bookOpen" tone="blue" size={18} />
              {detailsSection.title || t(lang, 'result.details')}
            </h4>
            <span className="inline-flex items-center gap-1 text-[var(--text-secondary)] text-sm">
              {expanded ? '收起' : '展开'}
              <AppIcon name={expanded ? 'chevronUp' : 'chevronDown'} size={16} />
            </span>
          </button>
          
          {expanded && (
            <div className="mt-4 pt-4 border-t border-[var(--border)] text-[var(--text-secondary)]">
              {formatText(detailsSection.content)}
            </div>
          )}
        </div>
      )}

      {/* 非结构化内容的回退显示 */}
      {!hasStructure && detailsSection && (
        <div className="card">
          <div className="text-[var(--text-secondary)]">
            {formatText(content)}
          </div>
        </div>
      )}
    </div>
  )
}
