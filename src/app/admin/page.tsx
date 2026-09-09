import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { requireAdminIdentity, requireAdminSession } from '@/lib/server/adminAuth'
import { getPersistence } from '@/lib/server/persistence'
import AdminWorkbench from './Workbench'

export const dynamic = 'force-dynamic'
export const revalidate = 0
// Soft navigation keeps the previous document's HTTP referrer policy.
export const metadata: Metadata = { title: '费曼读书助手', referrer: 'same-origin', robots: { index: false, follow: false } }

const authErrors: Record<string, string> = {
  origin: '请求来源无效，请重新打开管理页面。',
  too_large: '请求内容过大。', login: '请重新登录账号。', forbidden: '无权访问。',
  unavailable: '管理员服务暂时不可用。', mfa_unavailable: '管理员二次认证尚未启用。',
  locked: '验证码尝试次数过多，请稍后再试。', invalid_request: '请输入 6 位动态验证码。',
  invalid_code: '验证码无效，请使用认证器中的当前验证码。', failed: '认证失败，请重试。',
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const request = new Request('https://reader.deline.top/admin/', { headers: await headers() })
  const identity = await requireAdminIdentity(request)
  if (!identity.ok) notFound()
  const auth = await requireAdminSession(request)
  const query = await searchParams
  if (!auth.ok) {
    const error = typeof query.authError === 'string' ? authErrors[query.authError] : undefined
    return <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <a href="/account/" className="mb-8 text-sm text-[var(--accent)]">返回个人中心</a>
      <h1 className="text-xl font-semibold">系统管理员认证</h1>
      <form action="/api/admin/session/" method="post" className="mt-6 space-y-4">
        <label htmlFor="admin-code" className="block text-sm">动态验证码</label>
        <input id="admin-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] p-3 text-center text-xl" />
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <button type="submit" className="btn-primary min-h-11 w-full">进入系统管理</button>
      </form>
    </main>
  }
  const store = getPersistence()
  await store.writeAdminAuditLog?.({ adminUserId: auth.userId, action: 'admin_data_page_viewed', metadata: {
    table: typeof query.table === 'string' ? query.table.slice(0, 80) : '',
    view: typeof query.view === 'string' ? query.view.slice(0, 40) : 'dashboard',
    record: typeof query.record === 'string' ? query.record.slice(0, 2048) : '',
  } })
  return <AdminWorkbench query={query} adminUserId={auth.userId} />
}
