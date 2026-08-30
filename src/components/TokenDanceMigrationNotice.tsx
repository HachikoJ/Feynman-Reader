'use client'

import { BadgePercent, CheckCircle2, Database, ExternalLink, X } from 'lucide-react'
import { Language } from '@/lib/i18n'
import { useAccountAccess } from './AuthGuard'

interface Props {
  lang: Language
  onClose: () => void
  onOpenSettings?: () => void
}

export const TOKENDANCE_MIGRATION_NOTICE_KEY = 'feynman-tokendance-migration-notice'
export const TOKENDANCE_MIGRATION_NOTICE_VERSION = '2'

const pricingUrl = 'https://tokendance.space/models/deepseek-v4-flash-0731'

export default function TokenDanceMigrationNotice({ lang, onClose, onOpenSettings }: Props) {
  const { hasSignedInAccount, requestLogin } = useAccountAccess()
  const isZh = lang === 'zh'
  const handleClose = () => {
    localStorage.setItem(TOKENDANCE_MIGRATION_NOTICE_KEY, TOKENDANCE_MIGRATION_NOTICE_VERSION)
    onClose()
  }
  const handleConfigureTokenDance = () => {
    if (!hasSignedInAccount) {
      onClose()
      requestLogin(isZh
        ? '请先使用观猹登录。登录成功后，再为当前账号配置 TokenDance API Key。'
        : 'Sign in with Watcha first. After sign-in, configure a TokenDance API key for the current account.')
      return
    }
    handleClose()
    onOpenSettings?.()
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
              {isZh ? '老用户升级通知' : 'Returning user update'}
            </p>
            <h2 id="tokendance-migration-title" className="mt-1 text-xl font-bold">
              {isZh ? '账号与云端保存已升级' : 'Accounts and cloud storage have been upgraded'}
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
              ? '感谢你一直使用费曼读书助手。现在请使用观猹登录确认账号身份；登录后的书籍、学习记录、金句、助手会话和长期记忆会保存到账号云端。'
              : 'Thank you for using Feynman Reader. Sign in with Watcha to identify your account. Books, learning records, quotes, assistant sessions, and long-term memories are then saved to your account cloud.'}
          </p>

          <div className="rounded-lg border border-[var(--accent)]/35 bg-[var(--accent)]/8 p-3">
            <p className="font-semibold">
              {isZh ? '检测到本机旧数据时，请在 2026 年 10 月 1 日前完成迁移' : 'Migrate detected local history before October 1, 2026'}
            </p>
            <p className="mt-1 text-xs leading-5">
              {isZh
                ? '登录后，账号中心会显示历史迁移入口。迁移会合并书籍、笔记、实践、问答、金句、助手会话和长期记忆；同一记录冲突时以更新时间较新的内容为准。系统示例书不会上传。'
                : 'After sign-in, Account Center shows the legacy migration entry. It merges books, notes, practice, Q&A, quotes, assistant sessions, and long-term memories. Newer records win conflicts, and the system sample is not uploaded.'}
            </p>
          </div>

          <div className="grid gap-3 border-y border-[var(--border)] py-4 sm:grid-cols-2">
            <div className="flex items-start gap-2.5">
              <Database size={18} className="mt-1 shrink-0 text-[var(--text-primary)]" aria-hidden="true" />
              <p className="text-xs leading-5">
                {isZh ? '只有服务端确认迁移写入成功后，浏览器中的旧用户数据才会清理，并保留已迁移标记。' : 'Legacy browser data is cleared only after the server confirms a successful migration, and a migration marker is retained.'}
              </p>
            </div>
            <div className="flex items-start gap-2.5">
              <CheckCircle2 size={18} className="mt-1 shrink-0 text-[var(--text-primary)]" aria-hidden="true" />
              <p className="text-xs leading-5">
                {isZh ? '选择“不再提醒”会永久关闭自动提醒，但保留本机数据；账号中心仍提供一个小型历史迁移入口。' : 'Choosing “Do not remind me again” permanently hides the automatic notice but keeps local data; a small migration entry remains in Account Center.'}
              </p>
            </div>
          </div>

          <div className="brand-offer flex items-start gap-3 rounded-lg p-4">
            <BadgePercent size={22} className="mt-0.5 shrink-0 text-[var(--text-primary)]" aria-hidden="true" />
            <div>
              <p className="brand-emphasis-coral text-base">
                {isZh ? '先登录账号，再配置 AI' : 'Sign in before configuring AI'}
              </p>
              <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                {isZh
                  ? '请先使用观猹登录，再为当前账号配置 TokenDance API Key 并同意相关数据传输。API Key 加密保存在服务端，不进入云端备份。'
                  : 'Sign in with Watcha first, then configure a TokenDance API key for the current account and consent to the relevant data transfer. The key is encrypted on the server and excluded from cloud backups.'}
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
                <button type="button" onClick={handleConfigureTokenDance} className="btn-secondary min-h-11 justify-center">
                  {hasSignedInAccount ? (isZh ? '配置 TokenDance' : 'Configure TokenDance') : (isZh ? '登录后配置' : 'Sign in to configure')}
                </button>
              )}
              <a href="/account?tab=data" onClick={handleClose} className="btn-primary min-h-11 justify-center">
                {isZh ? '前往账号中心' : 'Open Account Center'}
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
