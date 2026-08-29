'use client'

import { BadgePercent, CheckCircle2, Database, ExternalLink, X } from 'lucide-react'
import { Language } from '@/lib/i18n'

interface Props {
  lang: Language
  onClose: () => void
  onOpenSettings?: () => void
}

export const TOKENDANCE_MIGRATION_NOTICE_KEY = 'feynman-tokendance-migration-notice'
export const TOKENDANCE_MIGRATION_NOTICE_VERSION = '1'

const pricingUrl = 'https://tokendance.space/models/deepseek-v4-flash-0731'

export default function TokenDanceMigrationNotice({ lang, onClose, onOpenSettings }: Props) {
  const isZh = lang === 'zh'
  const handleClose = () => {
    localStorage.setItem(TOKENDANCE_MIGRATION_NOTICE_KEY, TOKENDANCE_MIGRATION_NOTICE_VERSION)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="tokendance-migration-title"
        className="brand-dialog tokendance-surface flex max-h-[calc(100dvh-2rem)] w-full max-w-xl flex-col overflow-hidden rounded-xl"
      >
        <div className="brand-dialog-header flex items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4 sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-primary)]">
              {isZh ? '版本更新通知' : 'Version update notice'}
            </p>
            <h2 id="tokendance-migration-title" className="mt-1 text-xl font-bold">
              {isZh ? 'AI 接入渠道即将调整' : 'AI provider changes ahead'}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="icon-button shrink-0"
            aria-label={isZh ? '关闭通知' : 'Close notice'}
            title={isZh ? '关闭通知' : 'Close notice'}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 text-sm leading-6 sm:px-6">
          <div className="space-y-4">
          <p>
            {isZh
              ? '感谢你一直使用费曼读书助手。本版本新增并优先推荐 TokenDance / TokenPay，支持 OAuth 授权、余额查询和充值。'
              : 'Thank you for using Feynman Reader. This release adds and recommends TokenDance / TokenPay for OAuth authorization, balance checks, and top-ups.'}
          </p>

          <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 p-3 text-amber-800 dark:text-amber-200">
            <p className="font-semibold">
              {isZh ? 'DeepSeek 官方配置渠道将于 2026 年 10 月 1 日下线' : 'The direct DeepSeek configuration channel retires on October 1, 2026'}
            </p>
            <p className="mt-1 text-xs leading-5">
              {isZh
                ? '下线后，已配置的官方 Key 也不再支持调用。请在到期前保存相关配置，并改用 TokenDance API Key。'
                : 'After that date, existing direct keys will no longer be supported. Save any needed configuration and switch to a TokenDance API key before the deadline.'}
            </p>
          </div>

          <div className="grid gap-3 border-y border-[var(--border)] py-4 sm:grid-cols-2">
            <div className="flex items-start gap-2.5">
              <Database size={18} className="mt-1 shrink-0 text-[var(--text-primary)]" aria-hidden="true" />
              <p className="text-xs leading-5">
                {isZh ? '历史数据不会因本次更新被删除或覆盖。书籍、笔记、实践和问答记录仍保存在当前浏览器。' : 'This update does not delete or overwrite history. Books, notes, practice, and Q&A records remain in this browser.'}
              </p>
            </div>
            <div className="flex items-start gap-2.5">
              <CheckCircle2 size={18} className="mt-1 shrink-0 text-[var(--text-primary)]" aria-hidden="true" />
              <p className="text-xs leading-5">
                {isZh ? '当前版本不改变 IndexedDB 数据结构；默认示例只在空书架时创建，不会替换你的书籍。' : 'The IndexedDB schema is unchanged. The bundled example is created only for an empty shelf and does not replace your books.'}
              </p>
            </div>
          </div>

          <div className="brand-offer flex items-start gap-3 rounded-lg p-4">
            <BadgePercent size={22} className="mt-0.5 shrink-0 text-[var(--text-primary)]" aria-hidden="true" />
            <div>
              <p className="brand-emphasis-coral text-base">
                {isZh ? 'TokenDance 限时优惠，峰时最高约省 20%' : 'TokenDance limited-time savings: up to about 20% off at peak hours'}
              </p>
              <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                {isZh
                  ? '当前适用于峰时火山方舟端口；实际价格、适用线路、时段和活动期限以官方实时价目与通知为准。'
                  : 'Currently applies to the Volcengine Ark route at peak hours. Actual prices, eligible routes, periods, and offer dates follow official live pricing and notices.'}
              </p>
            </div>
          </div>

          </div>
        </div>

        <div className="shrink-0 border-t border-[var(--border)] px-5 py-4 sm:px-6">
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <a href={pricingUrl} target="_blank" rel="noopener noreferrer" className="tokendance-link inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium hover:underline">
              {isZh ? '查看 TokenDance 实时价目' : 'View TokenDance live pricing'}
              <ExternalLink size={16} aria-hidden="true" />
            </a>
            <div className="flex flex-col gap-2 sm:flex-row">
              {onOpenSettings && (
                <button type="button" onClick={() => { handleClose(); onOpenSettings() }} className="btn-secondary min-h-11 justify-center">
                  {isZh ? '前往设置配置' : 'Open Settings'}
                </button>
              )}
              <button type="button" onClick={handleClose} autoFocus className="btn-primary min-h-11 justify-center">
                {isZh ? '我知道了' : 'Got it'}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
