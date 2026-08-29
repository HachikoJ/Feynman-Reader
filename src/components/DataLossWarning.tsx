'use client'

import { useRef, useState } from 'react'
import { AlertTriangle, CloudOff, Download, HardDrive } from 'lucide-react'
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
              {isZh ? '请先确认本地数据风险' : 'Please confirm the local data risk'}
            </h2>
            <p className="mt-1 text-sm font-medium text-amber-600 dark:text-amber-400">
              {backupDue
                ? (isZh ? '你的学习数据尚未备份，或距离上次备份已超过 7 天。' : 'Your learning data has not been backed up, or the last backup was over 7 days ago.')
                : (isZh ? '本产品当前不提供云端存储、同步或恢复服务，学习数据仅保存在当前浏览器。' : 'This product currently does not provide cloud storage, sync, or recovery services. Learning data is stored only in this browser.')}
            </p>
          </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5 text-sm leading-6 md:p-6">
          <div className="space-y-3">
          <div className="flex items-start gap-3">
            <HardDrive size={19} className="mt-0.5 shrink-0 text-[var(--accent)]" aria-hidden="true" />
            <p>{isZh ? '书籍、笔记和学习记录仅保存在当前浏览器的本地存储中。' : 'Books, notes, and learning records are stored only in this browser.'}</p>
          </div>
          <div className="flex items-start gap-3">
            <CloudOff size={19} className="mt-0.5 shrink-0 text-rose-500" aria-hidden="true" />
            <p>
              {isZh
                ? '清理浏览器缓存或网站数据、卸载重装、浏览器更新或重置、切换设备或浏览器用户，都可能造成数据永久丢失。'
                : 'Clearing site data, reinstalling, updating or resetting the browser, or switching devices or browser profiles may permanently delete your data.'}
            </p>
          </div>
          <div className="flex items-start gap-3">
            <Download size={19} className="mt-0.5 shrink-0 text-emerald-500" aria-hidden="true" />
            <p>
              {isZh
                ? '请定期前往“设置 > 数据管理”导出备份。已有学习数据且距上次成功备份满 7 天时，系统会再次提醒，但不会自动备份。平台无法恢复未备份的数据。'
                : 'Export a backup regularly from Settings > Data Management. When learning data exists, the system reminds you 7 days after the last successful backup, but it does not back up automatically. The platform cannot recover unbacked-up data.'}
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
              ? '我已了解数据仅保存在本地，并会主动、定期导出备份。'
              : 'I understand that data is stored locally and I will export backups regularly.'}
          </span>
          </label>

          {confirmationError && (
            <p id="data-risk-confirmation-error" role="alert" className="mt-2 text-sm font-medium text-red-500">
              {isZh
                ? '请先勾选上方确认项，确认了解本地数据风险后再继续。'
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
