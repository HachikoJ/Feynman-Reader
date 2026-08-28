'use client'

import { useEffect, useState } from 'react'
import { ExternalLink, LogIn, RefreshCw } from 'lucide-react'
import { getAccount, isAccountRequired, type AccountUser } from '@/lib/accountClient'

interface Props {
  children: React.ReactNode
}

export default function AuthGuard({ children }: Props) {
  const [user, setUser] = useState<AccountUser | null>(null)
  const [checking, setChecking] = useState(true)
  const [serviceUnavailable, setServiceUnavailable] = useState(false)

  useEffect(() => {
    let cancelled = false
    void getAccount().then(state => {
      if (cancelled) return
      setUser(state.user)
      setServiceUnavailable(!state.configured)
    }).catch(() => {
      if (!cancelled) setServiceUnavailable(true)
    }).finally(() => {
      if (!cancelled) setChecking(false)
    })
    return () => { cancelled = true }
  }, [])

  if (checking && isAccountRequired()) {
    return <div className="flex min-h-screen items-center justify-center bg-[var(--bg-primary)]"><RefreshCw className="animate-spin text-[var(--accent)]" aria-label="正在检查账号" /></div>
  }

  // Before the cutoff, local-first users retain access during the migration window.
  if (isAccountRequired() && !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--bg-primary)] px-4">
        <section className="card w-full max-w-md p-6 text-center" aria-labelledby="account-required-title">
          <LogIn className="mx-auto mb-4 h-10 w-10 text-[var(--accent)]" aria-hidden="true" />
          <h1 id="account-required-title" className="text-xl font-bold">请登录后继续使用</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">自 2026 年 10 月 1 日起，学习数据将与账号绑定。请优先使用观猹登录。</p>
          {serviceUnavailable && <p role="alert" className="mt-3 text-sm text-amber-600">账号服务尚未配置完成，请联系管理员。</p>}
          <a href="/api/auth/tokendance/start" className="btn-primary mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2">使用观猹登录 <ExternalLink size={16} aria-hidden="true" /></a>
        </section>
      </main>
    )
  }

  return <>{children}</>
}
