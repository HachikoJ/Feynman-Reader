'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ExternalLink, LogIn, RefreshCw, ShieldCheck, UserRound } from 'lucide-react'
import { accountLoginHref, getAccount, isLocalAuthBypassEnabled, type AccountUser } from '@/lib/accountClient'

export default function LoginPage() {
  const localOnlyMode = isLocalAuthBypassEnabled()
  const [user, setUser] = useState<AccountUser | null>(null)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loginHref, setLoginHref] = useState(accountLoginHref('/'))

  useEffect(() => {
    if (localOnlyMode) {
      setChecking(false)
      return
    }
    const requested = new URLSearchParams(window.location.search).get('returnTo')
    setLoginHref(accountLoginHref(requested && requested.startsWith('/') ? requested : '/'))
    void getAccount().then(state => setUser(state.user)).catch(() => setError('暂时无法读取登录状态，请刷新页面重试。')).finally(() => setChecking(false))
  }, [localOnlyMode])

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
          <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{localOnlyMode ? '备案期间暂不开放账号登录。当前数据会保存在此浏览器，登录恢复后可在账号中心迁移到云端。' : '使用观猹账号登录后，你的账号和学习数据可以与服务器安全关联。'}</p>
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
          ) : localOnlyMode ? (
            <div className="mt-6 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/8 p-4" role="status">
              <p className="font-medium">备案期间使用本地模式</p>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">请返回费曼读书助手，在设置中打开本地数据管理。备案完成后会重新开放账号登录和云端迁移。</p>
              <Link href="/" className="btn-primary mt-4 inline-flex min-h-11 items-center gap-2"><ArrowLeft size={16} aria-hidden="true" />返回书架</Link>
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
              <a href={loginHref} className="btn-primary mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2">
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
