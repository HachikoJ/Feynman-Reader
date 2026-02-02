'use client'

import { Language, t } from '@/lib/i18n'

interface Props {
  lang: Language
  onGoSettings: () => void
  onLater: () => void
  onDontRemind: () => void
}

export default function ApiKeyAlert({ lang, onGoSettings, onLater, onDontRemind }: Props) {
  return (
    <div className="modal-overlay">
      <div className="modal-content text-center">
        <div className="text-5xl mb-4">🔑</div>
        <h2 className="text-xl font-bold mb-2">{t(lang, 'alert.needApiKey')}</h2>
        <p className="text-[var(--text-secondary)] mb-6">
          {t(lang, 'alert.needApiKeyDesc')}
        </p>
        
        <div className="space-y-3">
          <button onClick={onGoSettings} className="btn-primary w-full">
            {t(lang, 'alert.goSettings')}
          </button>
          <div className="flex gap-3">
            <button onClick={onLater} className="btn-secondary flex-1">
              {t(lang, 'alert.later')}
            </button>
            <button onClick={onDontRemind} className="btn-secondary flex-1">
              {t(lang, 'alert.dontRemind')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
