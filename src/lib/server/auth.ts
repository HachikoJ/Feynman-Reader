import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export type AuthProvider = 'tokendance' | 'phone' | 'email'

export interface AuthUser {
  id: string
  tokendanceSubject?: string
  phone?: string
  email?: string
  phoneVerifiedAt?: string
  emailVerifiedAt?: string
  createdAt: string
  updatedAt: string
}

export interface AuthSession {
  id: string
  userId: string
  expiresAt: string
  createdAt: string
}

export interface AuthStore {
  findUserById(userId: string): Promise<AuthUser | null>
  findByTokendanceSubject(subject: string): Promise<AuthUser | null>
  findByPhone(phone: string): Promise<AuthUser | null>
  findByEmail(email: string): Promise<AuthUser | null>
  createUser(input: { tokendanceSubject?: string; phone?: string; email?: string }): Promise<AuthUser>
  updateUser(userId: string, patch: Partial<Pick<AuthUser, 'tokendanceSubject' | 'phone' | 'email' | 'phoneVerifiedAt' | 'emailVerifiedAt'>>): Promise<AuthUser>
  createSession(userId: string, ttlSeconds: number): Promise<AuthSession>
  findSession(id: string): Promise<AuthSession | null>
  deleteSession(id: string): Promise<void>
}

export function normalizePhone(value: string): string {
  const compact = value.trim().replace(/[\s-]/g, '')
  if (/^1[3-9]\d{9}$/.test(compact)) return `+86${compact}`
  if (/^\+861[3-9]\d{9}$/.test(compact)) return compact
  throw new Error('请输入有效的中国大陆手机号。')
}

export function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase()
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('请输入有效的邮箱地址。')
  }
  return email
}

export function validateBinding(input: { provider: AuthProvider; phone?: string; email?: string }): { phone?: string; email?: string } {
  const phone = input.phone ? normalizePhone(input.phone) : undefined
  const email = input.email ? normalizeEmail(input.email) : undefined
  if (input.provider === 'email' && !phone) {
    throw new Error('邮箱登录必须先绑定并验证手机号。')
  }
  if (input.provider === 'phone' && !phone) {
    throw new Error('手机号登录需要提供手机号。')
  }
  if (input.provider === 'email' && !email) {
    throw new Error('邮箱登录需要提供邮箱地址。')
  }
  return { phone, email }
}

const SESSION_COOKIE = 'feynman_session'
const COOKIE_TTL_SECONDS = 60 * 60 * 24 * 30
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000

export interface OAuthStatePayload {
  nonce: string
  callback: string
  issuedAt: number
}

export function sessionCookieName(): string {
  return SESSION_COOKIE
}

export function shouldUseSecureCookies(request?: Request): boolean {
  const configured = process.env.FEYNMAN_COOKIE_SECURE?.trim().toLowerCase()
  const nodeEnv = process.env.NODE_ENV as string
  if (configured === 'true') return true
  if (configured === 'false' && nodeEnv !== 'production') return false
  if (nodeEnv === 'production') return true
  if (request) {
    const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase()
    if (forwardedProto) return forwardedProto === 'https'
    return new URL(request.url).protocol === 'https:'
  }
  return process.env.NODE_ENV === 'production'
}

function secureAttribute(request?: Request): string {
  return shouldUseSecureCookies(request) ? '; Secure' : ''
}

export function sessionCookieOptions(expires: Date, request?: Request): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly${secureAttribute(request)}; SameSite=Lax; Max-Age=${Math.max(0, Math.floor((expires.getTime() - Date.now()) / 1000))}`
}

export function sessionCookieHeader(sessionId: string, expires: Date, request?: Request): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly${secureAttribute(request)}; SameSite=Lax; Max-Age=${Math.max(0, Math.floor((expires.getTime() - Date.now()) / 1000))}`
}

export function oauthPkceCookieHeader(value: string, maxAgeSeconds: number, request?: Request): string {
  return `feynman_watcha_pkce=${encodeURIComponent(value)}; Path=/api/auth/tokendance/callback; HttpOnly${secureAttribute(request)}; SameSite=Lax; Max-Age=${maxAgeSeconds}`
}

export function createCsrfToken(): string {
  return randomBytes(32).toString('base64url')
}

export function signState(value: string): string {
  const secret = process.env.FEYNMAN_AUTH_STATE_SECRET
  if (!secret) throw new Error('FEYNMAN_AUTH_STATE_SECRET is not configured.')
  const signature = createHmac('sha256', secret).update(value).digest('base64url')
  return `${value}.${signature}`
}

export function verifyState(signed: string): string | null {
  const secret = process.env.FEYNMAN_AUTH_STATE_SECRET
  if (!secret) return null
  const separator = signed.lastIndexOf('.')
  if (separator <= 0) return null
  const value = signed.slice(0, separator)
  const supplied = Buffer.from(signed.slice(separator + 1), 'base64url')
  const expected = createHmac('sha256', secret).update(value).digest()
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null
  return value
}

export function createOAuthState(payload: OAuthStatePayload): string {
  return signState(Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url'))
}

export function readOAuthState(signed: string, now = Date.now()): OAuthStatePayload | null {
  const encoded = verifyState(signed)
  if (!encoded) return null
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Partial<OAuthStatePayload>
    if (typeof payload.nonce !== 'string' || !payload.nonce || typeof payload.callback !== 'string' || !payload.callback || typeof payload.issuedAt !== 'number') return null
    if (!Number.isFinite(payload.issuedAt) || Math.abs(now - payload.issuedAt) > OAUTH_STATE_TTL_MS) return null
    return { nonce: payload.nonce, callback: payload.callback, issuedAt: payload.issuedAt }
  } catch {
    return null
  }
}

export { COOKIE_TTL_SECONDS }
