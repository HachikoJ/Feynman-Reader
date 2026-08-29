'use client'

import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { getAccount, getMigrationState, migrateLocalData, type AccountUser, type MigrationState } from '@/lib/accountClient'
import { clearMigratedLocalData, inspectLocalMigration, type LocalMigrationSnapshot } from '@/lib/accountMigration'
import { initializeStore } from '@/lib/store'

interface Props {
  children: React.ReactNode
}

export default function AuthGuard({ children }: Props) {
  const [user, setUser] = useState<AccountUser | null>(null)
  const [checking, setChecking] = useState(true)
  const [localMigration, setLocalMigration] = useState<LocalMigrationSnapshot | null>(null)
  const [migrationState, setMigrationState] = useState<MigrationState | null>(null)
  const [migrationBusy, setMigrationBusy] = useState(false)
  const [migrationError, setMigrationError] = useState<string | null>(null)
  const [now, setNow] = useState(0)

  useEffect(() => {
    setNow(Date.now())
    let cancelled = false
    void getAccount().then(async state => {
      if (cancelled) return
      setUser(state.user)
      if (state.user) {
        const local = await inspectLocalMigration()
        if (!cancelled) setLocalMigration(local)
        if (local.hasData) {
          const remote = await getMigrationState(true)
          if (!cancelled) setMigrationState(remote)
        }
      }
    }).catch(() => {}).finally(() => {
      if (!cancelled) setChecking(false)
    })
    return () => { cancelled = true }
  }, [])

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

  // Keep SSR output stable; the client immediately performs the real session check.
  if (checking && typeof window !== 'undefined') {
    return <div className="flex min-h-screen items-center justify-center bg-[var(--bg-primary)]"><RefreshCw className="animate-spin text-[var(--accent)]" aria-label="正在检查账号" /></div>
  }

  if (migrationOpen) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--bg-primary)] px-4 py-8">
        <section className="card w-full max-w-lg p-6" aria-labelledby="legacy-migration-title">
          <h1 id="legacy-migration-title" className="text-xl font-bold">先迁移本机历史数据</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">检测到本浏览器中有 {localMigration?.books || 0} 本历史书籍。迁移完成后，今后的书架和学习记录将保存到账号云端；系统示例书不会上传。</p>
          <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">迁移入口只保留 3 天。服务端确认写入成功后，浏览器中的历史用户数据才会被清理，并保留已迁移标记。</p>
          <button type="button" onClick={() => void handleMigration()} disabled={migrationBusy} className="btn-primary mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2">
            {migrationBusy && <RefreshCw size={16} className="animate-spin" aria-hidden="true" />}
            {migrationBusy ? '正在迁移…' : '迁移到云端并继续'}
          </button>
          {migrationError && <p role="alert" className="mt-3 text-sm text-red-600">{migrationError} 本机数据未删除，可以重试。</p>}
        </section>
      </main>
    )
  }

  return <>{children}</>
}
