'use client'

import { FileSearch } from 'lucide-react'
import { Language } from '@/lib/i18n'
import { getDocumentCitationExcerpt } from '@/lib/documentContext'

interface Props {
  content: string
  documentContent?: string
  lang: Language
}

export default function SourceEvidence({ content, documentContent, lang }: Props) {
  if (!documentContent) return null

  const citationIds = Array.from(new Set(
    [...content.matchAll(/\[(S\d+)\]/g)].map(match => match[1])
  ))
  const excerpts = citationIds.flatMap(id => {
    const excerpt = getDocumentCitationExcerpt(documentContent, id)
    return excerpt ? [excerpt] : []
  })
  if (excerpts.length === 0) return null

  return (
    <details className="mt-3 border-t border-[var(--border)] pt-3">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-[var(--accent)]">
        <FileSearch size={16} aria-hidden="true" />
        {lang === 'zh' ? `核对原文证据（${excerpts.length}）` : `Verify source evidence (${excerpts.length})`}
      </summary>
      <div className="mt-3 space-y-3">
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
