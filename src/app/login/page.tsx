'use client'

import { useEffect, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { ArrowLeft, ExternalLink, LogIn, RefreshCw, ShieldCheck, UserRound } from 'lucide-react'
import { getAccount, isLocalAuthBypassEnabled, isWatchaOAuthEnabled, tokendanceLoginHref, type AccountUser } from '@/lib/accountClient'

export default function LoginPage() {
  const localOnlyMode = isLocalAuthBypassEnabled()
  const watchaEnabled = isWatchaOAuthEnabled()
  const [user, setUser] = useState<AccountUser | null>(null)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'password' | 'register'>('password')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (localOnlyMode) {
      setChecking(false)
      return
    }
    void getAccount().then(state => setUser(state.user)).catch(() => setError('暂时无法读取登录状态，请刷新页面重试。')).finally(() => setChecking(false))
  }, [localOnlyMode])

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const endpoint = mode === 'register' ? '/api/auth/password/register/' : '/api/auth/password/login/'
      const payload = mode === 'register' ? { username, password, email } : { username, password }
      const response = await fetch(endpoint, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await response.json().catch(() => ({})) as { error?: string; user?: AccountUser }
      if (!response.ok) throw new Error(data.error || (mode === 'register' ? '注册失败。' : '登录失败。'))
      const target = new URLSearchParams(window.location.search).get('returnTo')
      window.location.assign(target && target.startsWith('/') ? target : '/')
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '操作失败，请稍后重试。')
    } finally {
      setBusy(false)
    }
  }

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
          <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{localOnlyMode ? '当前使用本地数据模式。' : watchaEnabled ? '使用观猹账号登录后，你的账号和学习数据可以与服务器安全关联。' : '备案期间观猹登录暂时关闭，可使用用户名和密码注册或登录；登录后账号和学习数据会安全保存到云端。'}</p>
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
              <div className="mt-6 grid grid-cols-2 gap-2" role="tablist" aria-label="登录方式">
                <button type="button" className={`min-h-10 rounded-md border px-3 text-sm ${mode === 'password' ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]' : 'border-[var(--border)]'}`} onClick={() => setMode('password')}>账号登录</button>
                <button type="button" className={`min-h-10 rounded-md border px-3 text-sm ${mode === 'register' ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]' : 'border-[var(--border)]'}`} onClick={() => setMode('register')}>注册账号</button>
              </div>
              <form className="mt-4 space-y-3" onSubmit={submitPassword}>
                <label className="block text-sm"><span className="mb-1 block text-[var(--text-secondary)]">用户名</span><input required minLength={3} maxLength={32} value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" className="input w-full" /></label>
                {mode === 'register' && <label className="block text-sm"><span className="mb-1 block text-[var(--text-secondary)]">邮箱</span><input required type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" className="input w-full" /></label>}
                <label className="block text-sm"><span className="mb-1 block text-[var(--text-secondary)]">密码</span><input required minLength={8} maxLength={128} type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} className="input w-full" /></label>
                <button type="submit" disabled={busy} className="btn-primary inline-flex min-h-11 w-full items-center justify-center gap-2"><LogIn size={17} aria-hidden="true" />{busy ? '处理中…' : mode === 'register' ? '注册并登录' : '登录'}</button>
              </form>
              {watchaEnabled && <><div className="my-5 flex items-center gap-3 text-xs text-[var(--text-secondary)]"><span className="h-px flex-1 bg-[var(--border)]" />或<span className="h-px flex-1 bg-[var(--border)]" /></div>
              <a href={tokendanceLoginHref(new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search).get('returnTo') || '/')} className="btn-secondary inline-flex min-h-11 w-full items-center justify-center gap-2"><ExternalLink size={16} aria-hidden="true" />使用观猹登录</a></>}
              <p className="mt-3 text-xs leading-5 text-[var(--text-secondary)]">邮箱仅用于账号识别，不需要验证；密码会以加密哈希保存。</p>
            </>
          )}
        </div>
      </section>
    </main>
  )
}
