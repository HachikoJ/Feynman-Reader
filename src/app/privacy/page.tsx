'use client'

import { useEffect, useState } from 'react'
import MarkdownRenderer from '@/components/MarkdownRenderer'
import { Language } from '@/lib/i18n'
import { initializeStore, getSettings } from '@/lib/store'
import { privacyPolicyContent } from '@/lib/privacyPolicy'

export default function PrivacyPolicy() {
  const [lang, setLang] = useState<Language>('zh')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    void initializeStore()
      .then(() => setLang(getSettings().language))
      .finally(() => setMounted(true))
  }, [])

  if (!mounted) return null

  const currentContent = privacyPolicyContent[lang]

  const handleBack = () => {
    const referrer = document.referrer
    if (referrer) {
      try {
        if (new URL(referrer).origin === window.location.origin && window.history.length > 1) {
          window.history.back()
          return
        }
      } catch {
        // Invalid referrers fall back to the app home page.
      }
    }

    window.location.assign('/')
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4">{currentContent.title}</h1>
        <p className="text-[var(--text-secondary)]">{currentContent.lastUpdated}</p>
      </div>

      <div className="space-y-8">
        {currentContent.sections.map((section) => (
          <section key={section.title} className="card p-6">
            <h2 className="text-xl font-bold mb-4 text-[var(--accent)]">{section.title}</h2>
            <MarkdownRenderer content={section.content} />
          </section>
        ))}
      </div>

      <div className="mt-12 text-center">
        <button type="button" onClick={handleBack} className="btn-secondary">
          {lang === 'zh' ? '返回' : 'Back'}
        </button>
      </div>
    </div>
  )
}
