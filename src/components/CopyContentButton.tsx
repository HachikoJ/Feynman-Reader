'use client'

import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { Language } from '@/lib/i18n'

interface Props {
  content: string
  lang: Language
  label?: string
}

export default function CopyContentButton({ content, lang, label }: Props) {
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)
  const isZh = lang === 'zh'
  const accessibleLabel = failed
    ? (isZh ? '复制失败' : 'Copy failed')
    : copied
      ? (isZh ? '已复制' : 'Copied')
      : (label || (isZh ? '复制内容' : 'Copy content'))

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content)
      setFailed(false)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setFailed(true)
      window.setTimeout(() => setFailed(false), 1800)
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg px-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50"
      aria-label={accessibleLabel}
      title={accessibleLabel}
    >
      {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
      <span className="sr-only">{accessibleLabel}</span>
    </button>
  )
}
