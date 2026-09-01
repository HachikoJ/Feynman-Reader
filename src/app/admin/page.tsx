'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, BarChart3, BookOpen, Brain, LogOut, ShieldCheck, Users } from 'lucide-react'
import type { AdminDashboard } from '@/lib/server/persistence'

type ViewState = 'loading' | 'mfa' | 'dashboard' | 'denied' | 'error'

function number(value: number): string {
  return new Intl.NumberFormat('zh-CN').format(value)
}

function bytes(value: number): string {
  if (value < 1024 * 1024) return `${number(Math.round(value / 1024))} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

export default function AdminPage() {
  const [state, setState] = useState<ViewState>('loading')
  const [error, setError] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [data, setData] = useState<AdminDashboard | null>(null)

  async function loadDashboard() {
    const response = await fetch('/api/admin/dashboard', { credentials: 'include', cache: 'no-store' })
    if (response.ok) {
      setData(await response.json() as AdminDashboard)
      setState('dashboard')
      return
    }
    if (response.status === 401 || response.status === 403) {
      const session = await fetch('/api/admin/session', { credentials: 'include', cache: 'no-store' })
      const detail = await session.json().catch(() => ({})) as { error?: string }
      if (session.status === 401 || detail.error === '无权访问该页面。') setState('denied')
      else setState('mfa')
      return
    }
    throw new Error('管理员服务暂时不可用。')
  }

  useEffect(() => {
    void loadDashboard().catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : '读取管理员看板失败。')
      setState('error')
    })
  }, [])

  async function authenticate(event: FormEvent) {
    event.preventDefault()
    if (!/^\d{6}$/.test(code)) {
      setError('请输入 6 位动态验证码。')
      return
    }
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/admin/session', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const result = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(result.error || '管理员认证失败。')
      setCode('')
      await loadDashboard()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '管理员认证失败。')
    } finally {
      setBusy(false)
    }
  }

  async function logout() {
    await fetch('/api/admin/session', { method: 'DELETE', credentials: 'include' }).catch(() => undefined)
    setState('mfa')
    setData(null)
  }

  const statusRows = useMemo(() => Object.entries(data?.books.byStatus || {}).sort((a, b) => b[1] - a[1]), [data])
  const phaseRows = useMemo(() => Object.entries(data?.books.byPhase || {}).sort((a, b) => Number(a[0]) - Number(b[0])), [data])

  return (
    <main className="min-h-screen bg-[var(--bg-primary)] px-4 py-5 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <header className="mb-5 flex items-center justify-between gap-3">
          <Link href="/" className="inline-flex min-h-10 items-center gap-2 text-sm text-[var(--accent)]"><ArrowLeft size={16} aria-hidden="true" />返回费曼读书助手</Link>
          {state === 'dashboard' && <button type="button" onClick={() => void logout()} className="btn-secondary inline-flex min-h-10 items-center gap-2"><LogOut size={16} aria-hidden="true" />退出看板</button>}
        </header>

        {state === 'loading' && <section className="panel p-8 text-center text-sm text-[var(--text-secondary)]">正在验证管理员会话…</section>}
        {state === 'denied' && <section className="panel mx-auto max-w-md p-8 text-center"><ShieldCheck className="mx-auto mb-3 text-[var(--accent)]" size={34} aria-hidden="true" /><h1 className="text-lg font-semibold">管理员看板</h1><p className="mt-2 text-sm text-[var(--text-secondary)]">请先登录账号；该页面仅对获授权的系统管理员开放。</p><Link href="/login?returnTo=%2Fadmin" className="btn-primary mt-5 inline-flex min-h-10 items-center px-4">前往登录</Link></section>}
        {state === 'error' && <section className="panel mx-auto max-w-md p-8 text-center"><p className="text-sm text-red-700">{error}</p><button type="button" onClick={() => { setState('loading'); setError(''); void loadDashboard().catch(() => setState('error')) }} className="btn-secondary mt-5 min-h-10 px-4">重新检查</button></section>}
        {state === 'mfa' && <section className="panel mx-auto max-w-md p-8"><div className="mb-5 flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[var(--accent)]/10 text-[var(--accent)]"><ShieldCheck size={22} aria-hidden="true" /></div><div><h1 className="text-lg font-semibold">管理员二次认证</h1><p className="text-xs text-[var(--text-secondary)]">输入认证器中的 6 位动态验证码</p></div></div><form onSubmit={(event) => void authenticate(event)}><label className="block text-sm font-medium" htmlFor="admin-code">动态验证码</label><input id="admin-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} className="mt-2 min-h-12 w-full rounded-md border border-[var(--border)] bg-[var(--surface-glass-strong)] px-3 text-center text-xl tracking-[0.35em] outline-none focus:border-[var(--accent)]" /><button type="submit" disabled={busy || code.length !== 6} className="btn-primary mt-4 min-h-11 w-full">{busy ? '验证中…' : '进入管理看板'}</button>{error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}</form></section>}
        {state === 'dashboard' && data && <>
          <div className="mb-5"><p className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--accent)]">系统管理</p><h1 className="mt-1 text-2xl font-semibold">数据分析看板</h1><p className="mt-1 text-sm text-[var(--text-secondary)]">仅展示聚合指标，不包含用户隐私内容。</p></div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric icon={<Users size={18} />} label="用户总数" value={number(data.users.total)} detail={`近 30 天新增 ${number(data.users.newLast30Days)}`} />
            <Metric icon={<BookOpen size={18} />} label="云端书籍" value={number(data.books.total)} detail={`在读 ${number(data.books.active)} · 回收站 ${number(data.books.recycleBin)}`} />
            <Metric icon={<Brain size={18} />} label="AI 请求（30 天）" value={number(data.ai.requestsLast30Days)} detail={`${number(data.ai.totalTokensLast30Days)} tokens`} />
            <Metric icon={<BarChart3 size={18} />} label="近 7 天活跃用户" value={number(data.users.activeLast7Days)} detail={`行为事件 ${number(data.activity.eventsLast30Days)}`} />
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <section className="panel p-4"><h2 className="text-sm font-semibold">书籍状态</h2><div className="mt-3 space-y-2">{statusRows.length ? statusRows.map(([status, count]) => <BarRow key={status} label={status} value={count} total={data.books.total} />) : <Empty />}</div></section>
            <section className="panel p-4"><h2 className="text-sm font-semibold">费曼六阶段</h2><div className="mt-3 space-y-2">{phaseRows.length ? phaseRows.map(([phase, count]) => <BarRow key={phase} label={`阶段 ${phase}`} value={count} total={data.books.total} />) : <Empty />}</div></section>
            <section className="panel p-4"><h2 className="text-sm font-semibold">AI 用量（近 30 天）</h2><div className="mt-3 grid grid-cols-3 gap-2 text-center"><Mini label="输入" value={number(data.ai.promptTokensLast30Days)} /><Mini label="输出" value={number(data.ai.completionTokensLast30Days)} /><Mini label="合计" value={number(data.ai.totalTokensLast30Days)} /></div></section>
            <section className="panel p-4"><h2 className="text-sm font-semibold">存储概览</h2><div className="mt-3 grid grid-cols-2 gap-2 text-center"><Mini label="用户数据" value={bytes(data.activity.storageBytes)} /><Mini label="回收站" value={bytes(data.activity.recycleBinBytes)} /></div></section>
          </div>
          <p className="mt-4 text-right text-xs text-[var(--text-secondary)]">数据生成于 {new Date(data.generatedAt).toLocaleString('zh-CN')}</p>
        </>}
      </div>
    </main>
  )
}

function Metric({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return <section className="panel p-4"><div className="flex items-center gap-2 text-[var(--accent)]">{icon}<span className="text-xs text-[var(--text-secondary)]">{label}</span></div><p className="mt-2 text-2xl font-semibold">{value}</p><p className="mt-1 text-xs text-[var(--text-secondary)]">{detail}</p></section>
}
function BarRow({ label, value, total }: { label: string; value: number; total: number }) {
  const width = total ? Math.max(4, Math.round(value / total * 100)) : 4
  return <div><div className="mb-1 flex justify-between text-xs"><span>{label}</span><span className="text-[var(--text-secondary)]">{number(value)}</span></div><div className="h-2 overflow-hidden rounded-full bg-[var(--bg-secondary)]"><div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${width}%` }} /></div></div>
}
function Mini({ label, value }: { label: string; value: string }) { return <div className="rounded-md bg-[var(--bg-secondary)] p-3"><p className="text-xs text-[var(--text-secondary)]">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div> }
function Empty() { return <p className="text-xs text-[var(--text-secondary)]">暂无数据</p> }
