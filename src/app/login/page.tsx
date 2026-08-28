'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ExternalLink, LogIn, RefreshCw, ShieldCheck, UserRound } from 'lucide-react'
import { getAccount, type AccountUser } from '@/lib/accountClient'

export default function LoginPage() {
  const [user, setUser] = useState<AccountUser | null>(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    void getAccount().then(state => setUser(state.user)).finally(() => setChecking(false))
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
          <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
            使用观猹账号登录后，你的账号和学习数据可以与服务器安全关联。
          </p>
          {checking ? (
            <div className="mt-6 flex min-h-11 items-center justify-center text-sm text-[var(--text-secondary)]" role="status">
              <RefreshCw size={16} className="mr-2 animate-spin" aria-hidden="true" />正在检查登录状态
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
            <>
              <a href="/api/auth/tokendance/start/" className="btn-primary mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2">
                <LogIn size={17} aria-hidden="true" />使用观猹登录<ExternalLink size={15} aria-hidden="true" />
              </a>
              <p className="mt-4 text-xs leading-5 text-[var(--text-secondary)]">
                点击后会跳转到观猹官方授权页面。我们只申请基础账号信息，不读取手机号和邮箱。
              </p>
            </>
          )}
        </div>
      </section>
    </main>
  )
}
