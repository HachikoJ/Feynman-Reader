'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Check, EyeOff, ExternalLink, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react'
import { deleteApiKey, getAccount, getApiKeyStatus, saveApiKey, type AccountUser } from '@/lib/accountClient'

export default function AccountPage() {
  const [user, setUser] = useState<AccountUser | null>(null)
  const [keyStatus, setKeyStatus] = useState<{ configured: boolean; masked: string } | null>(null)
  const [draftKey, setDraftKey] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void Promise.all([getAccount(), getApiKeyStatus()]).then(([account, key]) => {
      setUser(account.user)
      setKeyStatus(key)
    }).catch(reason => setError(reason instanceof Error ? reason.message : '账号服务暂时不可用。'))
  }, [])

  const handleSave = async () => {
    if (!draftKey.trim() || busy) return
    setBusy(true); setError(null); setMessage(null)
    try { await saveApiKey(draftKey.trim()); setDraftKey(''); setKeyStatus({ configured: true, masked: '已配置（不会显示完整密钥）' }); setMessage('API Key 已加密保存，页面不会显示明文。') }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'API Key 保存失败。') }
    finally { setBusy(false) }
  }

  const handleDelete = async () => {
    if (busy) return
    setBusy(true); setError(null); setMessage(null)
    try { await deleteApiKey(); setKeyStatus({ configured: false, masked: '' }); setMessage('API Key 已删除。') }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'API Key 删除失败。') }
    finally { setBusy(false) }
  }

  return <main className="mx-auto min-h-screen max-w-2xl bg-[var(--bg-primary)] px-4 py-8">
    <Link href="/" className="mb-6 inline-flex min-h-11 items-center gap-2 text-sm text-[var(--accent)]"><ArrowLeft size={16} aria-hidden="true" />返回费曼读书助手</Link>
    <h1 className="text-2xl font-bold">账号与安全</h1>
    <section className="card mt-6 p-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><ShieldCheck size={19} aria-hidden="true" />登录方式</h2>
      <p className="mt-3 text-sm text-[var(--text-secondary)]">{user ? `当前账号：${user.email || user.phone || '观猹账号已连接'}` : '尚未读取到登录账号。'}</p>
      {user ? <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">当前使用观猹账号登录。</p> : <a href="/api/auth/tokendance/start" className="btn-primary mt-4 inline-flex min-h-11 items-center gap-2">使用观猹登录 <ExternalLink size={16} aria-hidden="true" /></a>}
    </section>
    <section className="card mt-4 p-5">
      <h2 className="text-lg font-semibold">TokenDance API Key</h2>
      <div className="mt-3 flex items-center gap-2 text-sm text-[var(--text-secondary)]"><EyeOff size={16} aria-hidden="true" />{keyStatus?.configured ? keyStatus.masked : '尚未配置'}</div>
      <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">密钥只在服务端加密保存并在调用上游 API 时解密。管理员界面不会显示、导出或回显完整密钥。</p>
      <label className="mt-4 block text-sm font-medium" htmlFor="account-api-key">新增或替换密钥</label>
      <input id="account-api-key" type="password" autoComplete="new-password" value={draftKey} onChange={event => setDraftKey(event.target.value)} className="input-field mt-2" placeholder="粘贴后仅提交一次，不会回显" />
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => void handleSave()} disabled={busy || !draftKey.trim()} className="btn-primary inline-flex min-h-11 items-center gap-2">{busy ? <RefreshCw size={16} className="animate-spin" aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}保存密钥</button>
        <button type="button" onClick={() => void handleDelete()} disabled={busy || !keyStatus?.configured} className="btn-secondary inline-flex min-h-11 items-center gap-2 text-red-500"><Trash2 size={16} aria-hidden="true" />删除密钥</button>
      </div>
      {message && <p role="status" className="mt-3 text-sm text-emerald-600">{message}</p>}
      {error && <p role="alert" className="mt-3 text-sm text-red-500">{error}</p>}
    </section>
  </main>
}
