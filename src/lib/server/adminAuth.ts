import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { AuthUser } from './auth'
import { shouldUseSecureCookies } from './auth'
import { getPersistence } from './persistence'
import type { AdminRole } from './persistence'
import { sessionUserId } from './sessionUser'

const ADMIN_SESSION_COOKIE = 'feynman_admin_session'
const ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 8

export interface AdminSessionToken {
  token: string
  tokenHash: string
  expiresAt: Date
}

export function adminSessionCookieName(): string {
  return ADMIN_SESSION_COOKIE
}

export function adminSessionTtlSeconds(): number {
  return ADMIN_SESSION_TTL_SECONDS
}

export function hashAdminSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function createAdminSessionToken(now = Date.now(), ttlSeconds = ADMIN_SESSION_TTL_SECONDS): AdminSessionToken {
  if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0 || ttlSeconds > ADMIN_SESSION_TTL_SECONDS) throw new Error('管理员会话时长无效。')
  const token = randomBytes(32).toString('base64url')
  return { token, tokenHash: hashAdminSessionToken(token), expiresAt: new Date(now + ttlSeconds * 1000) }
}

export function adminSessionCookieHeader(token: string, expiresAt: Date, request?: Request): string {
  const secure = shouldUseSecureCookies(request) ? '; Secure' : ''
  return `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly${secure}; SameSite=Strict; Max-Age=${Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000))}`
}

export function clearAdminSessionCookieHeader(request?: Request): string {
  const secure = shouldUseSecureCookies(request) ? '; Secure' : ''
  return `${ADMIN_SESSION_COOKIE}=; Path=/; HttpOnly${secure}; SameSite=Strict; Max-Age=0`
}

export function clearLegacyAdminSessionCookieHeader(request?: Request): string {
  const secure = shouldUseSecureCookies(request) ? '; Secure' : ''
  return `${ADMIN_SESSION_COOKIE}=; Path=/api/admin; HttpOnly${secure}; SameSite=Strict; Max-Age=0`
}

export function adminSessionTokenFromRequest(request: Request): string | null {
  const part = (request.headers.get('cookie') || '').split(';').map(value => value.trim())
    .find(value => value.startsWith(`${ADMIN_SESSION_COOKIE}=`))
  if (!part) return null
  try {
    const token = decodeURIComponent(part.slice(ADMIN_SESSION_COOKIE.length + 1))
    return token ? token : null
  } catch {
    return null
  }
}

export function adminSessionHashMatches(token: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashAdminSessionToken(token), 'ascii')
  const expected = Buffer.from(expectedHash, 'ascii')
  return expected.length === actual.length && /^[a-f0-9]{64}$/.test(expectedHash) && timingSafeEqual(actual, expected)
}

function requestOrigin(request: Request): string {
  const url = new URL(request.url)
  const proto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
  const host = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  return proto && host ? `${proto}://${host}` : url.origin
}

export function hasSameAdminOrigin(request: Request, configuredOrigin = process.env.FEYNMAN_PUBLIC_ORIGIN?.trim()): boolean {
  const origin = request.headers.get('origin')?.trim()
  if (!origin) return false
  if (process.env.NODE_ENV === 'production' && !configuredOrigin) return false
  try {
    return new URL(origin).origin === (configuredOrigin || requestOrigin(request))
  } catch {
    return false
  }
}

export type AdminAuthResult =
  | { ok: true; userId: string; session: import('./persistence').AdminSessionRecord }
  | { ok: false; status: 401 | 403 | 503; error: string }

export type AdminIdentityResult =
  | { ok: true; userId: string }
  | { ok: false; status: 401 | 403 | 503; error: string }

/** Display names are not identities; only the provider subject can bind an administrator. */
export function adminIdentityMatches(role: Pick<AdminRole, 'userId' | 'tokendanceSubject'>, user: Pick<AuthUser, 'id' | 'tokendanceSubject'>): boolean {
  const adminUserId = process.env.FEYNMAN_ADMIN_USER_ID?.trim().toLowerCase()
  const adminSubject = process.env.FEYNMAN_ADMIN_PROVIDER_SUBJECT?.trim()
  return Boolean(adminUserId && adminSubject)
    && user.id === adminUserId
    && user.tokendanceSubject === adminSubject
    && role.userId === user.id
    && typeof role.tokendanceSubject === 'string'
    && role.tokendanceSubject.length > 0
    && role.tokendanceSubject === user.tokendanceSubject
}

/** Resolve the sole administrator before rendering even the MFA entry page. */
export async function requireAdminIdentity(request: Request): Promise<AdminIdentityResult> {
  const userId = await sessionUserId(request)
  if (!userId) return { ok: false, status: 401, error: '请先登录账号。' }
  const store = getPersistence()
  if (!store.findAdminRole) {
    return { ok: false, status: 503, error: '管理员服务尚未配置完成。' }
  }
  const user = await store.findUserById(userId)
  if (!user) return { ok: false, status: 403, error: '账号当前不可用。' }
  const role = await store.findAdminRole(userId)
  if (!role || !adminIdentityMatches(role, user) || role.revokedAt || role.role !== 'super_admin') return { ok: false, status: 403, error: '无权访问该页面。' }
  return { ok: true, userId }
}

/** Authorize from both the ordinary account session and the independent MFA session. */
export async function requireAdminSession(request: Request): Promise<AdminAuthResult> {
  const identity = await requireAdminIdentity(request)
  if (!identity.ok) return identity
  const { userId } = identity
  const store = getPersistence()
  if (!store.findAdminSession || !store.getAdminTotpCredential) {
    return { ok: false, status: 503, error: '管理员服务尚未配置完成。' }
  }
  const credential = await store.getAdminTotpCredential(userId)
  if (!credential?.enabled) return { ok: false, status: 403, error: '管理员二次认证尚未启用。' }
  const token = adminSessionTokenFromRequest(request)
  if (!token) return { ok: false, status: 403, error: '请先完成管理员二次认证。' }
  const session = await store.findAdminSession(hashAdminSessionToken(token))
  const expiresAt = session ? Date.parse(session.expiresAt) : NaN
  if (!session || session.userId !== userId || session.revokedAt || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return { ok: false, status: 403, error: '管理员会话已失效，请重新认证。' }
  }
  return { ok: true, userId, session }
}
