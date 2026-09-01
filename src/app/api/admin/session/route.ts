import { NextResponse } from 'next/server'
import { decryptApiKey } from '@/lib/server/apiKeyVault'
import {
  adminSessionCookieHeader,
  adminSessionTokenFromRequest,
  adminIdentityMatches,
  clearAdminSessionCookieHeader,
  createAdminSessionToken,
  hasSameAdminOrigin,
  hashAdminSessionToken,
  requireAdminSession,
} from '@/lib/server/adminAuth'
import { verifyTotpCode } from '@/lib/server/adminTotp'
import { sessionUserId } from '@/lib/server/sessionUser'
import { getPersistence, isPersistenceUnavailable } from '@/lib/server/persistence'

export const runtime = 'nodejs'

function unavailable(error: unknown): NextResponse | null {
  return isPersistenceUnavailable(error)
    ? NextResponse.json({ error: '账号服务数据库尚未配置或管理员迁移未完成。' }, { status: 503 })
    : null
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const result = await requireAdminSession(request)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json({ ok: true, userId: result.userId, expiresAt: result.session.expiresAt }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return unavailable(error) || NextResponse.json({ error: '读取管理员会话失败。' }, { status: 500 })
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!hasSameAdminOrigin(request)) return NextResponse.json({ error: '请求来源无效。' }, { status: 403 })
  const contentLength = Number(request.headers.get('content-length') || 0)
  if (contentLength > 4096) return NextResponse.json({ error: '请求内容过大。' }, { status: 413 })
  try {
    const userId = await sessionUserId(request)
    if (!userId) return NextResponse.json({ error: '请先登录账号。' }, { status: 401 })
    const store = getPersistence()
    if (!store.findAdminRole || !store.getAdminTotpCredential || !store.createAdminSession) {
      return NextResponse.json({ error: '管理员服务尚未配置完成。' }, { status: 503 })
    }
    const user = await store.findUserById(userId)
    if (!user) return NextResponse.json({ error: '账号当前不可用。' }, { status: 403 })
    const role = await store.findAdminRole(userId)
    if (!role || !adminIdentityMatches(role, user) || role.revokedAt || role.role !== 'super_admin') return NextResponse.json({ error: '无权访问该页面。' }, { status: 403 })
    const credential = await store.getAdminTotpCredential(userId)
    if (!credential?.enabled) return NextResponse.json({ error: '管理员二次认证尚未启用。' }, { status: 403 })
    if (credential.lockedUntil && Date.parse(credential.lockedUntil) > Date.now()) {
      return NextResponse.json({ error: '验证码尝试次数过多，请稍后再试。' }, { status: 429 })
    }
    const rawBody = await request.text()
    if (rawBody.length > 4096) return NextResponse.json({ error: '请求内容过大。' }, { status: 413 })
    let body: { code?: unknown }
    try { body = JSON.parse(rawBody) as { code?: unknown } } catch { return NextResponse.json({ error: '请求格式无效。' }, { status: 400 }) }
    const code = typeof body.code === 'string' ? body.code.trim() : ''
    let secret: string
    try { secret = decryptApiKey(credential.secret) } catch { return NextResponse.json({ error: '管理员二次认证配置无效。' }, { status: 503 }) }
    if (!verifyTotpCode(secret, code)) {
      if (store.recordAdminTotpFailure) {
        const nextAttempts = credential.failedAttempts + 1
        const lockedUntil = nextAttempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null
        await store.recordAdminTotpFailure(userId, lockedUntil)
      }
      return NextResponse.json({ error: '验证码无效。' }, { status: 401 })
    }
    if (store.resetAdminTotpFailures) await store.resetAdminTotpFailures(userId)
    if (store.markAdminTotpUsed) await store.markAdminTotpUsed(userId)
    const issued = createAdminSessionToken()
    const now = new Date().toISOString()
    await store.createAdminSession({
      idHash: issued.tokenHash,
      userId,
      expiresAt: issued.expiresAt.toISOString(),
      mfaVerifiedAt: now,
      createdAt: now,
      lastUsedAt: now,
      revokedAt: null,
    })
    if (store.writeAdminAuditLog) await store.writeAdminAuditLog({ adminUserId: userId, action: 'admin_session_created' })
    const response = NextResponse.json({ ok: true, expiresAt: issued.expiresAt.toISOString() })
    response.headers.set('Set-Cookie', adminSessionCookieHeader(issued.token, issued.expiresAt, request))
    return response
  } catch (error) {
    return unavailable(error) || NextResponse.json({ error: '管理员认证失败。' }, { status: 500 })
  }
}

export async function DELETE(request: Request): Promise<NextResponse> {
  if (!hasSameAdminOrigin(request)) return NextResponse.json({ error: '请求来源无效。' }, { status: 403 })
  const response = new NextResponse(null, { status: 204 })
  response.headers.set('Set-Cookie', clearAdminSessionCookieHeader(request))
  try {
    const userId = await sessionUserId(request)
    const token = adminSessionTokenFromRequest(request)
    const store = getPersistence()
    if (token && store.revokeAdminSession) await store.revokeAdminSession(hashAdminSessionToken(token))
    if (userId && store.writeAdminAuditLog) await store.writeAdminAuditLog({ adminUserId: userId, action: 'admin_session_revoked' })
  } catch {
    // Clearing the cookie still removes the browser-side administrator session.
  }
  return response
}
