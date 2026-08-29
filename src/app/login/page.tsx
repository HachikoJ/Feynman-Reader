'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, RefreshCw, ShieldCheck, UserRound } from 'lucide-react'
import { getAccount, type AccountUser } from '@/lib/accountClient'

export default function LoginPage() {
  const [user, setUser] = useState<AccountUser | null>(null)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void getAccount().then(state => setUser(state.user)).catch(() => setError('暂时无法读取登录状态，请刷新页面重试。')).finally(() => setChecking(false))
  }, [])

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--bg-primary)] px-4 py-8">
      <section className="w-full max-w-md">
        <Link href="/" className="mb-8 inline-flex min-h-11 items-center gap-2 text-sm text-[var(--accent)]">
          <ArrowLeft size={16} aria-hidden="true" />
          返回费曼读书助手
        </Link>
        <div className="card p-6 sm:p-8">
          <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
            <UserRound size={26} aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold">登录费曼读书助手</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">观猹登录即将上线，敬请期待～</p>
          {checking ? (
            <div className="mt-6 flex min-h-11 items-center justify-center text-sm text-[var(--text-secondary)]" role="status">
              <RefreshCw size={16} className="mr-2 animate-spin" aria-hidden="true" />正在检查登录状态
            </div>
          ) : error ? (
            <div className="mt-6 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4" role="alert">
              <p className="text-sm text-amber-700">{error}</p>
              <button type="button" onClick={() => window.location.reload()} className="btn-secondary mt-4 inline-flex min-h-11 items-center gap-2">
                <RefreshCw size={16} aria-hidden="true" />重新检查
              </button>
            </div>
          ) : user ? (
            <div className="mt-6 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4" role="status">
              <p className="font-medium">你已经登录</p>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">当前使用观猹账号。</p>
              <Link href="/account" className="btn-primary mt-4 inline-flex min-h-11 items-center gap-2">
                <ShieldCheck size={16} aria-hidden="true" />打开账号中心
              </Link>
            </div>
          ) : (
            <div className="mt-6 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/10 p-4 text-sm leading-6 text-[var(--text-secondary)]" role="status">
              观猹登录即将上线，敬请期待～
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
