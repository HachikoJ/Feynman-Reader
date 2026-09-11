'use client'

import { FileSearch } from 'lucide-react'
import { Language } from '@/lib/i18n'
import { getDocumentCitationExcerpt } from '@/lib/documentContext'

interface Props {
  content: string
  documentContent?: string
  /** 用户在原文中的划线 / 笔记，用于核对 AI 点评引用的 [H#] 证据。 */
  highlights?: { quote?: string; note?: string; chapterTitle?: string }[]
  lang: Language
}

export default function SourceEvidence({ content, documentContent, highlights = [], lang }: Props) {
  const citationIds = documentContent
    ? Array.from(new Set([...content.matchAll(/\[(S\d+)\]/g)].map(match => match[1])))
    : []
  const excerpts = citationIds.flatMap(id => {
    const excerpt = getDocumentCitationExcerpt(documentContent!, id)
    return excerpt ? [excerpt] : []
  })
  const highlightRefs = Array.from(new Set([...content.matchAll(/\[(H\d+)\]/g)].map(match => match[1])))
  const citedHighlights = highlightRefs.flatMap(id => {
    const index = Number(id.slice(1)) - 1
    const item = Number.isInteger(index) && index >= 0 ? highlights[index] : undefined
    if (!item || (!item.quote?.trim() && !item.note?.trim())) return []
    return [{ id, ...item }]
  })
  if (excerpts.length === 0 && citedHighlights.length === 0) return null

  return (
    <details className="mt-3 border-t border-[var(--border)] pt-3">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-[var(--accent)]">
        <FileSearch size={16} aria-hidden="true" />
        {lang === 'zh'
          ? `核对原文证据（${excerpts.length + citedHighlights.length}）`
          : `Verify source evidence (${excerpts.length + citedHighlights.length})`}
      </summary>
      <div className="mt-3 space-y-3">
        {citedHighlights.map(item => (
          <blockquote key={item.id} className="border-l-2 border-amber-500/60 pl-3 text-xs leading-5 text-[var(--text-secondary)]">
            <p className="mb-1 font-semibold text-[var(--text-primary)]">
              [{item.id}] {lang === 'zh' ? '你的划线' : 'Your highlight'}
              {item.chapterTitle ? ` · ${item.chapterTitle}` : ''}
            </p>
            {item.quote?.trim() && <p className="whitespace-pre-wrap">{item.quote}</p>}
            {item.note?.trim() && item.note.trim() !== item.quote?.trim() && (
              <p className="mt-1 whitespace-pre-wrap text-[var(--text-secondary)]">
                {lang === 'zh' ? '我的笔记：' : 'My note: '}{item.note}
              </p>
            )}
          </blockquote>
        ))}
        {excerpts.map(excerpt => (
          <blockquote key={excerpt.id} className="border-l-2 border-[var(--accent)]/50 pl-3 text-xs leading-5 text-[var(--text-secondary)]">
            <p className="mb-1 font-semibold text-[var(--text-primary)]">
              [{excerpt.id}] {lang === 'zh' ? `全文约 ${excerpt.position}%` : `Around ${excerpt.position}% of the source`}
            </p>
            <p className="whitespace-pre-wrap">{excerpt.excerpt}</p>
          </blockquote>
        ))}
      </div>
    </details>
  )
}
