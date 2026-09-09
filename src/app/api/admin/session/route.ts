import { NextResponse } from 'next/server'
import { decryptApiKey } from '@/lib/server/apiKeyVault'
import {
  adminSessionCookieHeader,
  adminSessionTokenFromRequest,
  clearAdminSessionCookieHeader,
  clearLegacyAdminSessionCookieHeader,
  createAdminSessionToken,
  hasSameAdminOrigin,
  hashAdminSessionToken,
  requireAdminIdentity,
  requireAdminSession,
} from '@/lib/server/adminAuth'
import { verifyTotpCode } from '@/lib/server/adminTotp'
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
  const isHtmlForm = request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() === 'application/x-www-form-urlencoded'
  const fail = (status: number, error: string, code: string): NextResponse => isHtmlForm
    ? new NextResponse(null, { status: 303, headers: { Location: `/admin/?authError=${code}`, 'Cache-Control': 'no-store' } })
    : NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } })
  if (!hasSameAdminOrigin(request)) return fail(403, '请求来源无效。', 'origin')
  const contentLength = Number(request.headers.get('content-length') || 0)
  if (contentLength > 4096) return fail(413, '请求内容过大。', 'too_large')
  try {
    const identity = await requireAdminIdentity(request)
    if (!identity.ok) return fail(identity.status, identity.error, identity.status === 401 ? 'login' : identity.status === 503 ? 'unavailable' : 'forbidden')
    const { userId } = identity
    const store = getPersistence()
    if (!store.getAdminTotpCredential || !store.createAdminSession) {
      return fail(503, '管理员服务尚未配置完成。', 'unavailable')
    }
    const credential = await store.getAdminTotpCredential(userId)
    if (!credential?.enabled) return fail(403, '管理员二次认证尚未启用。', 'mfa_unavailable')
    if (credential.lockedUntil && Date.parse(credential.lockedUntil) > Date.now()) {
      return fail(429, '验证码尝试次数过多，请稍后再试。', 'locked')
    }
    const rawBody = await request.text()
    if (Buffer.byteLength(rawBody, 'utf8') > 4096) return fail(413, '请求内容过大。', 'too_large')
    let body: { code?: unknown }
    try {
      body = isHtmlForm ? { code: new URLSearchParams(rawBody).get('code') } : JSON.parse(rawBody) as { code?: unknown }
      if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(400, '请求格式无效。', 'invalid_request')
    } catch { return fail(400, '请求格式无效。', 'invalid_request') }
    const code = typeof body.code === 'string' ? body.code.trim() : ''
    let secret: string
    try { secret = decryptApiKey(credential.secret) } catch { return fail(503, '管理员二次认证配置无效。', 'mfa_unavailable') }
    if (!verifyTotpCode(secret, code)) {
      if (store.recordAdminTotpFailure) {
        const nextAttempts = credential.failedAttempts + 1
        const lockedUntil = nextAttempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null
        await store.recordAdminTotpFailure(userId, lockedUntil)
      }
      return fail(401, '验证码无效。', 'invalid_code')
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
    const response = isHtmlForm
      ? new NextResponse(null, { status: 303, headers: { Location: '/admin/', 'Cache-Control': 'no-store' } })
      : NextResponse.json({ ok: true, expiresAt: issued.expiresAt.toISOString() }, { headers: { 'Cache-Control': 'no-store' } })
    response.headers.append('Set-Cookie', clearLegacyAdminSessionCookieHeader(request))
    response.headers.append('Set-Cookie', adminSessionCookieHeader(issued.token, issued.expiresAt, request))
    return response
  } catch (error) {
    return isPersistenceUnavailable(error)
      ? fail(503, '账号服务数据库尚未配置或管理员迁移未完成。', 'unavailable')
      : fail(500, '管理员认证失败。', 'failed')
  }
}

export async function DELETE(request: Request): Promise<NextResponse> {
  if (!hasSameAdminOrigin(request)) return NextResponse.json({ error: '请求来源无效。' }, { status: 403 })
  const response = new NextResponse(null, { status: 204 })
  response.headers.append('Set-Cookie', clearAdminSessionCookieHeader(request))
  response.headers.append('Set-Cookie', clearLegacyAdminSessionCookieHeader(request))
  try {
    const identity = await requireAdminIdentity(request)
    if (!identity.ok) return response
    const { userId } = identity
    const token = adminSessionTokenFromRequest(request)
    const store = getPersistence()
    if (token && store.revokeAdminSession) await store.revokeAdminSession(hashAdminSessionToken(token))
    if (userId && store.writeAdminAuditLog) await store.writeAdminAuditLog({ adminUserId: userId, action: 'admin_session_revoked' })
  } catch {
    // Clearing the cookie still removes the browser-side administrator session.
  }
  return response
}
