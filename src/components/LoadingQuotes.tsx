'use client'

import { useState, useEffect, useMemo } from 'react'
import { Language } from '@/lib/i18n'
import type { CustomQuote } from '@/lib/store'
import { defaultQuotesEn, defaultQuotesZh, pickQuoteWithPriority, prioritizeQuotes } from '@/lib/defaultQuotes'
import AppIcon from './AppIcon'

export { defaultQuotesEn, defaultQuotesZh }

export function localizePresetQuotes(quotes: CustomQuote[], lang: Language): CustomQuote[] {
  const presets = quotes.filter(quote => quote.isPreset)
  if (presets.length === 0) return quotes

  const localizedPresets = lang === 'zh' ? defaultQuotesZh : defaultQuotesEn
  const alreadyLocalized = presets.length === localizedPresets.length && presets.every((quote, index) => (
    quote.text === localizedPresets[index].text && quote.author === localizedPresets[index].author
  ))
  if (alreadyLocalized) return prioritizeQuotes(quotes)

  return prioritizeQuotes([...localizedPresets, ...quotes.filter(quote => !quote.isPreset)])
}
interface Props {
  lang: Language
  quotes?: CustomQuote[]
}

export default function LoadingQuotes({ lang, quotes = [] }: Props) {
  const [currentIndex, setCurrentIndex] = useState(() => {
    // 初始就随机选择一个
    const displayQuotes = quotes.length > 0 ? localizePresetQuotes(quotes, lang) : (lang === 'zh' ? defaultQuotesZh : defaultQuotesEn)
    return Math.max(0, displayQuotes.indexOf(pickQuoteWithPriority(displayQuotes) || displayQuotes[0]))
  })
  const [fade, setFade] = useState(true)

  // 如果没有金句，使用默认的
  const displayQuotes = useMemo(() => quotes.length > 0
    ? localizePresetQuotes(quotes, lang)
    : (lang === 'zh' ? defaultQuotesZh : defaultQuotesEn), [quotes, lang])

  useEffect(() => {
    if (displayQuotes.length === 0) return

    const interval = setInterval(() => {
      setFade(false)
      setTimeout(() => {
        // 用户金句优先，系统金句作为补充
        setCurrentIndex(() => Math.max(0, displayQuotes.indexOf(pickQuoteWithPriority(displayQuotes) || displayQuotes[0])))
        setFade(true)
      }, 300)
    }, 4000)

    return () => clearInterval(interval)
  }, [displayQuotes])

  if (displayQuotes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="relative mb-8">
          <div className="w-16 h-16 border-4 border-[var(--accent)]/30 rounded-full"></div>
          <div className="absolute top-0 left-0 w-16 h-16 border-4 border-transparent border-t-[var(--accent)] rounded-full animate-spin"></div>
          <AppIcon name="library" tone="accent" size={24} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />
        </div>
        <p className="text-sm text-[var(--text-secondary)]">
          {lang === 'zh' ? 'AI 正在深度分析中，请稍候...' : 'AI is analyzing, please wait...'}
        </p>
      </div>
    )
  }

  const quote = displayQuotes[currentIndex % displayQuotes.length]

  return (
    <div className="flex flex-col items-center justify-center py-12">
      {/* Loading Animation */}
      <div className="relative mb-8">
        <div className="w-16 h-16 border-4 border-[var(--accent)]/30 rounded-full"></div>
        <div className="absolute top-0 left-0 w-16 h-16 border-4 border-transparent border-t-[var(--accent)] rounded-full animate-spin"></div>
        <AppIcon name="library" tone="accent" size={24} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />
      </div>

      {/* Quote */}
      <div className={`text-center max-w-md transition-opacity duration-300 ${fade ? 'opacity-100' : 'opacity-0'}`}>
        <p className="text-lg mb-2 text-[var(--text-primary)]">"{quote.text}"</p>
        <p className="text-sm text-[var(--text-secondary)]">— {quote.author}</p>
      </div>

      {/* Progress Dots */}
      <div className="flex gap-2 mt-6">
        {Array.from({ length: Math.min(5, displayQuotes.length) }).map((_, idx) => (
          <div
            key={idx}
            className={`w-2 h-2 rounded-full transition-all ${
              idx === currentIndex % 5 ? 'bg-[var(--accent)] w-4' : 'bg-[var(--border)]'
            }`}
          />
        ))}
      </div>

      <p className="text-sm text-[var(--text-secondary)] mt-6">
        {lang === 'zh' ? 'AI 正在深度分析中，请稍候...' : 'AI is analyzing, please wait...'}
      </p>
    </div>
  )
}
