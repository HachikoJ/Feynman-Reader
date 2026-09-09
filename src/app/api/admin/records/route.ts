import { NextResponse } from 'next/server'
import { requireAdminSession, hasSameAdminOrigin, clearAdminSessionCookieHeader, clearLegacyAdminSessionCookieHeader } from '@/lib/server/adminAuth'
import { getPersistence } from '@/lib/server/persistence'
import { AdminMutationError, mutateAdminRecord, restoreAdminChange, type AdminMutationAction } from '@/lib/server/adminMutations'

export const runtime = 'nodejs'
const MAX_BYTES = 20 * 1024 * 1024
const escape = (text: string) => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!))

function failure(message: string, status: number, form?: FormData): Response {
  const fields = form ? ['table', 'key', 'version', 'action', 'changeId'].map(name => `<input type="hidden" name="${name}" value="${escape(String(form.get(name) || ''))}">`).join('') : ''
  const patch = form?.get('patch')
  return new Response(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>操作未完成</title><style>body{font:16px/1.7 system-ui,sans-serif;max-width:900px;margin:40px auto;padding:20px;color:#222}textarea{box-sizing:border-box;width:100%;min-height:360px;padding:12px}button,input{padding:12px;margin:12px 0}a{color:#315efb}</style></head><body><h1>操作未完成</h1><p role="alert">${escape(message)}</p>${form ? `<form method="post" action="/api/admin/records/">${fields}${typeof patch === 'string' ? `<label>尚未保存的修改<textarea name="patch">${escape(patch)}</textarea></label>` : ''}<label>输入“确认”重试 <input name="confirmation" required pattern="确认" autocomplete="off"></label><button type="submit">重新提交</button></form>` : ''}<p><a href="/admin/?view=changes">返回系统管理</a></p></body></html>`, {
    status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'" },
  })
}

export async function POST(request: Request): Promise<Response> {
  if (!hasSameAdminOrigin(request)) return new Response(null, { status: 403 })
  let form: FormData | undefined
  try {
    const auth = await requireAdminSession(request)
    if (!auth.ok) return new Response(null, { status: auth.status, headers: { 'Cache-Control': 'no-store' } })
    if (Number(request.headers.get('content-length') || 0) > MAX_BYTES) return failure('提交内容超过 20 MB。', 413)
    if (!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) return failure('请求格式无效。', 400)
    const body = await request.text()
    if (Buffer.byteLength(body) > MAX_BYTES) return failure('提交内容超过 20 MB。', 413)
    const params = new URLSearchParams(body)
    form = new FormData()
    for (const [key, val] of params) form.set(key, val)
    const action = String(form.get('action') || '')
    if (action === 'logout') {
      const store = getPersistence()
      await store.revokeAdminSession?.(auth.session.idHash)
      await store.writeAdminAuditLog?.({ adminUserId: auth.userId, action: 'admin_session_revoked' })
      const response = NextResponse.redirect(new URL('/account/', request.url), 303)
      response.headers.append('Set-Cookie', clearAdminSessionCookieHeader(request))
      response.headers.append('Set-Cookie', clearLegacyAdminSessionCookieHeader(request))
      response.headers.set('Cache-Control', 'no-store')
      return response
    }
    if (form.get('confirmation') !== '确认') return failure('请确认当前记录及本次操作。', 400, form)
    if (action === 'restore') await restoreAdminChange(auth.userId, String(form.get('changeId') || ''))
    else {
      if (!['edit', 'delete', 'disable', 'enable', 'revoke'].includes(action)) return failure('不支持的操作。', 400)
      let patch: Record<string, unknown> | undefined
      if (action === 'edit') {
        try { patch = JSON.parse(String(form.get('patch') || '')) } catch { return failure('JSON 格式无效，请修正后重新提交。', 400, form) }
      }
      await mutateAdminRecord(auth.userId, { action: action as AdminMutationAction, table: String(form.get('table') || ''), key: String(form.get('key') || ''), version: String(form.get('version') || ''), patch })
    }
    const response = NextResponse.redirect(new URL('/admin/?view=changes&success=1', request.url), 303)
    response.headers.set('Cache-Control', 'no-store')
    return response
  } catch (error) {
    // Database exceptions can include row values; expose only application validation messages.
    const message = error instanceof AdminMutationError
      ? error.message : '操作失败，数据未被修改。请稍后重试。'
    return failure(message, 400, form)
  }
}
