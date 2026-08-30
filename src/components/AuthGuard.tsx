'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { ExternalLink, LogIn, RefreshCw } from 'lucide-react'
import { accountLoginHref, getAccount, getMigrationState, isLocalAuthBypassEnabled, migrateLocalData, type AccountUser, type MigrationState } from '@/lib/accountClient'
import { clearMigratedLocalData, dismissLocalMigrationNotice, inspectLocalMigration, type LocalMigrationSnapshot } from '@/lib/accountMigration'
import { initializeStore } from '@/lib/store'

interface Props {
  children: React.ReactNode
}

interface AccountAccessValue {
  user: AccountUser | null
  configured: boolean
  checking: boolean
  isAuthenticated: boolean
  hasSignedInAccount: boolean
  requestLogin: (message?: string, returnTo?: string) => void
}

const AccountAccessContext = createContext<AccountAccessValue | null>(null)

export function useAccountAccess(): AccountAccessValue {
  const value = useContext(AccountAccessContext)
  if (!value) {
    return {
      user: null,
      configured: false,
      checking: false,
      // Standalone component consumers (including unit tests) retain the
      // historical behavior; the app always renders these inside AuthGuard.
      isAuthenticated: true,
      hasSignedInAccount: true,
      requestLogin: () => undefined,
    }
  }
  return value
}

export default function AuthGuard({ children }: Props) {
  const [user, setUser] = useState<AccountUser | null>(null)
  const [checking, setChecking] = useState(true)
  const [localMigration, setLocalMigration] = useState<LocalMigrationSnapshot | null>(null)
  const [migrationState, setMigrationState] = useState<MigrationState | null>(null)
  const [migrationBusy, setMigrationBusy] = useState(false)
  const [migrationError, setMigrationError] = useState<string | null>(null)
  const [now, setNow] = useState(0)
  const [serviceUnavailable, setServiceUnavailable] = useState(false)
  const [loginPrompt, setLoginPrompt] = useState<{ message: string; returnTo?: string } | null>(null)

  useEffect(() => {
    setNow(Date.now())
    let cancelled = false
    void getAccount().then(async state => {
      if (cancelled) return
      setUser(state.user)
      setServiceUnavailable(!state.configured)
      if (state.user) {
        const local = await inspectLocalMigration()
        if (!cancelled) setLocalMigration(local)
        if (local.hasData) {
          const remote = await getMigrationState(true)
          if (!cancelled) setMigrationState(remote)
        }
      }
    }).catch(() => { if (!cancelled) setServiceUnavailable(true) }).finally(() => {
      if (!cancelled) setChecking(false)
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (user) setLoginPrompt(null)
  }, [user])

  const migrationOpen = Boolean(
    user && localMigration?.hasData && migrationState && migrationState.status !== 'completed' &&
    (!migrationState.deadlineAt || now === 0 || Date.parse(migrationState.deadlineAt) > now)
  )

  const handleMigration = async () => {
    if (!localMigration?.payload || migrationBusy) return
    setMigrationBusy(true)
    setMigrationError(null)
    try {
      await migrateLocalData(localMigration.payload)
      await clearMigratedLocalData()
      await initializeStore()
      setLocalMigration({ ...localMigration, hasData: false, payload: null })
      setMigrationState({ ...migrationState!, status: 'completed', completedAt: new Date().toISOString() })
    } catch (error) {
      setMigrationError(error instanceof Error ? error.message : '历史数据迁移失败，请稍后重试。')
    } finally {
      setMigrationBusy(false)
    }
  }

  const accessValue: AccountAccessValue = {
    user,
    configured: !serviceUnavailable,
    checking,
    isAuthenticated: Boolean(user) || isLocalAuthBypassEnabled(),
    hasSignedInAccount: Boolean(user),
    requestLogin: (message, returnTo) => setLoginPrompt({ message: message || '登录后才能保存你的学习内容，并在其他设备继续使用。', returnTo }),
  }
  const loginHref = accountLoginHref(loginPrompt?.returnTo || (typeof window === 'undefined' ? '/' : `${window.location.pathname}${window.location.search}${window.location.hash}`))

  return (
    <AccountAccessContext.Provider value={accessValue}>
      {migrationOpen ? (
      <main className="flex min-h-screen items-center justify-center bg-[var(--bg-primary)] px-4 py-8">
        <section className="card w-full max-w-lg p-6" aria-labelledby="legacy-migration-title">
          <h1 id="legacy-migration-title" className="text-xl font-bold">先迁移本机历史数据</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">检测到本浏览器中有 {localMigration?.books || 0} 本历史书籍、{localMigration?.assistantSessions || 0} 个助手会话和 {localMigration?.assistantMemories || 0} 条长期记忆。迁移会与账号云端数据合并，同一记录以更新时间较新的内容为准；系统示例书不会上传。</p>
          <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">历史数据迁移入口开放至 2026 年 10 月 1 日。服务端确认写入成功后，浏览器中的历史用户数据才会被清理，并保留已迁移标记。选择“不再提醒”会保留本机数据，之后仍可从账号中心手动迁移。</p>
          <button type="button" onClick={() => void handleMigration()} disabled={migrationBusy} className="btn-primary mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2">
            {migrationBusy && <RefreshCw size={16} className="animate-spin" aria-hidden="true" />}
            {migrationBusy ? '正在迁移…' : '迁移到云端并继续'}
          </button>
          <button
            type="button"
            onClick={() => {
              dismissLocalMigrationNotice()
              setLocalMigration(null)
            }}
            disabled={migrationBusy}
            className="mt-2 inline-flex min-h-10 w-full items-center justify-center rounded-md px-3 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]"
          >
            不再提醒（保留本机数据）
          </button>
          {migrationError && <p role="alert" className="mt-3 text-sm text-red-600">{migrationError} 本机数据未删除，可以重试。</p>}
        </section>
      </main>
      ) : children}
      {loginPrompt && (
        <div className="modal-overlay z-[100]" role="dialog" aria-modal="true" aria-labelledby="login-required-title" onClick={() => setLoginPrompt(null)}>
          <section className="card w-[min(92vw,28rem)] p-6" onClick={event => event.stopPropagation()}>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 rounded-full bg-[var(--accent)]/12 p-2 text-[var(--accent)]"><LogIn size={19} aria-hidden="true" /></span>
              <div className="min-w-0">
                <h2 id="login-required-title" className="text-lg font-semibold">需要登录</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{loginPrompt.message}</p>
              </div>
            </div>
            {serviceUnavailable && <p role="alert" className="mt-3 text-sm text-amber-600">账号服务暂时不可用，请稍后重试。</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn-secondary min-h-10 px-4" onClick={() => setLoginPrompt(null)}>稍后</button>
              <a href={loginHref} className="btn-primary inline-flex min-h-10 items-center gap-2 px-4">使用观猹登录 <ExternalLink size={16} aria-hidden="true" /></a>
            </div>
          </section>
        </div>
      )}
    </AccountAccessContext.Provider>
  )
}
