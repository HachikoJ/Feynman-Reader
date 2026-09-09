'use client'

import { useRef, useState } from 'react'
import { AlertTriangle, UserRound, Download, HardDrive } from 'lucide-react'
import { Language } from '@/lib/i18n'
import { isWatchaOAuthEnabled } from '@/lib/accountClient'

interface Props {
  lang: Language
  onContinue: () => void
}

export default function DataLossWarning({ lang, onContinue }: Props) {
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
              {isZh ? '了解历史记录与备份' : 'Review history and backup options'}
            </h2>
            <p className="mt-1 text-sm font-medium text-amber-600 dark:text-amber-400">
              {isZh ? '旧版本的本机记录需要单独导入，请先保留好这部分内容。' : 'Local records from older versions need a separate import. Keep them until the import is complete.'}
            </p>
          </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5 text-sm leading-6 md:p-6">
          <div className="space-y-3">
          <div className="flex items-start gap-3">
            <UserRound size={19} className="mt-0.5 shrink-0 text-[var(--accent)]" aria-hidden="true" />
            <p>{isZh ? `通过${isWatchaOAuthEnabled() ? '【观猹】' : '账号'}登录后，可在账号中心统一管理个人书架、笔记、金句和费曼小助手记录。` : `After signing in${isWatchaOAuthEnabled() ? ' with Watcha' : ''}, manage your library, notes, quotes, and Feynman Assistant records in Account Center.`}</p>
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
                ? '请前往“账号中心 > 数据管理”导入本机历史记录，或导出一份学习备份。API Key 不会包含在导出文件中。'
                : 'Use Account Center > Data Management to import local history or export a backup of your learning records. API keys are excluded from exports.'}
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
              ? '我已了解本机历史记录的导入与备份规则。'
              : 'I understand how to import and back up local history.'}
          </span>
          </label>

          {confirmationError && (
            <p id="data-risk-confirmation-error" role="alert" className="mt-2 text-sm font-medium text-red-500">
              {isZh
                ? '请先勾选上方确认项，了解历史记录的导入与备份规则后再继续。'
                : 'Please check the confirmation above before continuing.'}
            </p>
          )}
        </div>

        <div className="shrink-0 border-t border-[var(--border)] p-5 md:p-6">
          <button
            type="button"
            onClick={() => runConfirmedAction(onContinue)}
            className="btn-secondary w-full"
          >
            {isZh ? '我已了解，继续使用' : 'I understand, continue'}
          </button>
        </div>
      </div>
    </div>
  )
}
