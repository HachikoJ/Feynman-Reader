'use client'

import { useRef, useState } from 'react'
import { AlertTriangle, Cloud, Download, HardDrive } from 'lucide-react'
import { Language } from '@/lib/i18n'

interface Props {
  lang: Language
  backupDue: boolean
  onContinue: () => void
  onOpenBackup: () => void
}

export default function DataLossWarning({ lang, backupDue, onContinue, onOpenBackup }: Props) {
  const [confirmed, setConfirmed] = useState(false)
  const [confirmationError, setConfirmationError] = useState(false)
  const confirmationCheckboxRef = useRef<HTMLInputElement>(null)
  const isZh = lang === 'zh'

  const runConfirmedAction = (action: () => void) => {
    if (!confirmed) {
      setConfirmationError(true)
      confirmationCheckboxRef.current?.focus()
      return
    }

    action()
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="data-loss-warning-title"
        className="brand-dialog flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-xl border-amber-500/40"
      >
        <div className="shrink-0 border-b border-[var(--border)] p-5 md:p-6">
          <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-500">
            <AlertTriangle size={24} aria-hidden="true" />
          </div>
          <div>
            <h2 id="data-loss-warning-title" className="text-xl font-bold">
              {isZh ? '请确认数据保存与迁移规则' : 'Confirm data storage and migration'}
            </h2>
            <p className="mt-1 text-sm font-medium text-amber-600 dark:text-amber-400">
              {backupDue
                ? (isZh ? '你的学习数据尚未导出云端备份，或距离上次导出已超过 7 天。' : 'Your cloud learning data has not been exported, or the last export was over 7 days ago.')
                : (isZh ? '登录后的新数据保存到账号云端；本机旧数据需登录后迁移。' : 'New signed-in data is saved to your account cloud; legacy local data must be migrated after sign-in.')}
            </p>
          </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5 text-sm leading-6 md:p-6">
          <div className="space-y-3">
          <div className="flex items-start gap-3">
            <Cloud size={19} className="mt-0.5 shrink-0 text-[var(--accent)]" aria-hidden="true" />
            <p>{isZh ? '使用观猹登录后，书籍、笔记、金句、学习记录和费曼小助手数据会按账号保存到云端。' : 'After Watcha sign-in, books, notes, quotes, learning records, and Feynman Assistant data are saved to the cloud per account.'}</p>
          </div>
          <div className="flex items-start gap-3">
            <HardDrive size={19} className="mt-0.5 shrink-0 text-rose-500" aria-hidden="true" />
            <p>
              {isZh
                ? '尚未迁移的 IndexedDB 历史数据只存在于当前浏览器；清理网站数据会造成这部分内容永久丢失。'
                : 'Unmigrated IndexedDB history exists only in this browser. Clearing site data permanently deletes that legacy content.'}
            </p>
          </div>
          <div className="flex items-start gap-3">
            <Download size={19} className="mt-0.5 shrink-0 text-emerald-500" aria-hidden="true" />
            <p>
              {isZh
                ? '请前往“账号中心 > 数据管理”迁移历史数据。导入与导出工具始终保留，备份不包含 API Key；未迁移或未备份的内容无法代为恢复。'
                : 'Use Account Center > Data Management to migrate history. Import and export tools remain available, and backups exclude API keys; unmigrated or unbacked-up data cannot be recovered for you.'}
            </p>
          </div>
          </div>

          <label className={`mt-5 flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm ${
          confirmationError
            ? 'border-red-500/60 bg-red-500/10'
            : 'border-amber-500/30 bg-amber-500/10'
        }`}>
          <input
            ref={confirmationCheckboxRef}
            type="checkbox"
            checked={confirmed}
            aria-describedby={confirmationError ? 'data-risk-confirmation-error' : undefined}
            onChange={event => {
              const checked = event.target.checked
              setConfirmed(checked)
              if (checked) setConfirmationError(false)
            }}
            className="mt-1 h-4 w-4 shrink-0 accent-amber-500"
          />
          <span>
            {isZh
              ? '我已了解登录后的云端保存、IndexedDB 历史迁移和备份规则。'
              : 'I understand cloud storage after sign-in, IndexedDB history migration, and backup rules.'}
          </span>
          </label>

          {confirmationError && (
            <p id="data-risk-confirmation-error" role="alert" className="mt-2 text-sm font-medium text-red-500">
              {isZh
                ? '请先勾选上方确认项，确认了解数据保存与迁移规则后再继续。'
                : 'Please check the confirmation above before continuing.'}
            </p>
          )}
        </div>

        <div className={`shrink-0 grid grid-cols-1 gap-2 border-t border-[var(--border)] p-5 md:p-6 ${backupDue ? 'sm:grid-cols-2' : ''}`}>
          {backupDue && (
            <button
              type="button"
              onClick={() => runConfirmedAction(onOpenBackup)}
              className="btn-primary flex items-center justify-center gap-2"
            >
              <Download size={17} aria-hidden="true" />
              {isZh ? '前往数据管理' : 'Open Data Management'}
            </button>
          )}
          <button
            type="button"
            onClick={() => runConfirmedAction(onContinue)}
            className="btn-secondary"
          >
            {isZh ? '我已了解，继续使用' : 'I understand, continue'}
          </button>
        </div>
      </div>
    </div>
  )
}
