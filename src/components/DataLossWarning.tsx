'use client'

import { useState } from 'react'
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
  const isZh = lang === 'zh'

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="data-loss-warning-title"
        className="w-full max-w-lg rounded-lg border border-amber-500/40 bg-[var(--bg-card)] p-5 shadow-2xl md:p-6"
      >
        <div className="mb-4 flex items-start gap-3">
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

        <div className="space-y-3 text-sm leading-6">
          <div className="flex items-start gap-3">
            <HardDrive size={19} className="mt-0.5 shrink-0 text-sky-500" aria-hidden="true" />
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
                ? '请定期前往“设置 > 数据管理”导出备份。平台无法恢复未备份的数据，因未及时备份造成的数据丢失需由用户自行承担。'
                : 'Export a backup regularly from Settings > Data Management. The platform cannot recover data that was not backed up; users are responsible for losses caused by missing backups.'}
            </p>
          </div>
        </div>

        <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={event => setConfirmed(event.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 accent-amber-500"
          />
          <span>
            {isZh
              ? '我已了解数据仅保存在本地，并会主动、定期导出备份。'
              : 'I understand that data is stored locally and I will export backups regularly.'}
          </span>
        </label>

        <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button type="button" onClick={onOpenBackup} disabled={!confirmed} className="btn-primary flex items-center justify-center gap-2">
            <Download size={17} aria-hidden="true" />
            {isZh ? '前往数据管理' : 'Open Data Management'}
          </button>
          <button type="button" onClick={onContinue} disabled={!confirmed} className="btn-secondary">
            {isZh ? '我已了解，继续使用' : 'I understand, continue'}
          </button>
        </div>
      </div>
    </div>
  )
}
