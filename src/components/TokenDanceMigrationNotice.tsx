'use client'

import { CheckCircle2, Database, ExternalLink, Route, X } from 'lucide-react'
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
        className="w-full max-w-xl overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] bg-[var(--bg-secondary)] px-5 py-4 sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--accent)]">
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

        <div className="space-y-4 px-5 py-5 text-sm leading-6 sm:px-6">
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
              <Database size={18} className="mt-1 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              <p className="text-xs leading-5">
                {isZh ? '历史数据不会因本次更新被删除或覆盖。书籍、笔记、实践和问答记录仍保存在当前浏览器。' : 'This update does not delete or overwrite history. Books, notes, practice, and Q&A records remain in this browser.'}
              </p>
            </div>
            <div className="flex items-start gap-2.5">
              <CheckCircle2 size={18} className="mt-1 shrink-0 text-sky-600 dark:text-sky-400" aria-hidden="true" />
              <p className="text-xs leading-5">
                {isZh ? '当前版本不改变 IndexedDB 数据结构；默认示例只在空书架时创建，不会替换你的书籍。' : 'The IndexedDB schema is unchanged. The bundled example is created only for an empty shelf and does not replace your books.'}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2.5 text-xs text-[var(--text-secondary)]">
            <Route size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
            <p>
              {isZh
                ? 'TokenDance 的优惠为有条件优惠：峰时火山方舟端口最高约省 20%，其他路由不保证；价格和活动期限以官方实时通知为准。'
                : 'TokenDance savings are conditional: up to about 20% off the Volcengine Ark route at peak hours, with no guarantee on other routes. Pricing and offer dates follow official notices.'}
            </p>
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <a href={pricingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium text-[var(--accent)] hover:bg-[var(--accent)]/10">
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
