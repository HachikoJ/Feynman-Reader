import { NextResponse } from 'next/server'
import { COOKIE_TTL_SECONDS, oauthPkceCookieHeader, readOAuthState, sessionCookieHeader } from '@/lib/server/auth'
import { getTokendanceCallbackUrl, isWatchaOAuthEnabled, TOKENDANCE_OAUTH_TOKEN_URL, TOKENDANCE_OAUTH_USERINFO_URL } from '@/lib/server/authConfig'
import { getPersistence, isPersistenceUnavailable } from '@/lib/server/persistence'

export const runtime = 'nodejs'

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === '23505')
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!isWatchaOAuthEnabled()) return NextResponse.json({ error: '观猹登录暂时关闭，请使用用户名和密码登录。' }, { status: 503 })
  const url = new URL(request.url)
  const code = url.searchParams.get('code')?.trim()
  const state = url.searchParams.get('state')?.trim()
  const parsedState = state ? readOAuthState(state) : null
  if (url.searchParams.get('error')) return NextResponse.json({ error: '用户取消了观猹登录授权。' }, { status: 400 })
  if (!code || !state || !parsedState) return NextResponse.json({ error: '登录状态无效或已过期。' }, { status: 400 })
  const callback = getTokendanceCallbackUrl(request)
  if (parsedState.callback !== callback) return NextResponse.json({ error: '登录回调地址不匹配。' }, { status: 400 })
  const clientId = process.env.TOKENDANCE_OAUTH_CLIENT_ID?.trim()
  const clientSecret = process.env.TOKENDANCE_OAUTH_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) return NextResponse.json({ error: '观猹登录尚未配置完成。' }, { status: 503 })
  const cookieHeader = request.headers.get('cookie') || ''
  const pkceCookie = cookieHeader.split(';').map(value => value.trim()).find(value => value.startsWith('feynman_watcha_pkce='))
  const pkceValue = pkceCookie ? decodeURIComponent(pkceCookie.slice('feynman_watcha_pkce='.length)) : ''
  const separator = pkceValue.indexOf('.')
  const nonce = separator > 0 ? pkceValue.slice(0, separator) : ''
  const verifier = separator > 0 ? pkceValue.slice(separator + 1) : ''
  if (!nonce || nonce !== parsedState.nonce || !verifier) return NextResponse.json({ error: '登录验证信息缺失或已失效，请重试。' }, { status: 400 })
  const exchangeUrl = process.env.TOKENDANCE_OAUTH_TOKEN_URL?.trim() || TOKENDANCE_OAUTH_TOKEN_URL
  try {
    const form = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: callback, client_id: clientId, client_secret: clientSecret, code_verifier: verifier })
    const response = await fetch(exchangeUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form })
    if (!response.ok) return NextResponse.json({ error: '观猹登录授权交换失败。' }, { status: 502 })
    const token = await response.json() as { access_token?: unknown }
    if (typeof token.access_token !== 'string' || !token.access_token.trim()) return NextResponse.json({ error: '观猹未返回有效访问令牌。' }, { status: 502 })
    const userResponse = await fetch(process.env.TOKENDANCE_OAUTH_USERINFO_URL?.trim() || TOKENDANCE_OAUTH_USERINFO_URL, { headers: { Authorization: `Bearer ${token.access_token}` } })
    if (!userResponse.ok) return NextResponse.json({ error: '观猹用户信息读取失败。' }, { status: 502 })
    const userData = await userResponse.json() as { statusCode?: unknown; data?: { user_id?: unknown; nickname?: unknown; name?: unknown; avatar?: unknown; avatar_url?: unknown; avatarUrl?: unknown } }
    const subjectValue = userData.data?.user_id
    const subject = typeof subjectValue === 'number' ? String(subjectValue) : typeof subjectValue === 'string' ? subjectValue.trim() : ''
    if (!subject || subject.length > 255) return NextResponse.json({ error: '观猹未返回稳定用户标识。' }, { status: 502 })
    const profileName = [userData.data?.nickname, userData.data?.name].find(value => typeof value === 'string' && value.trim())
    const displayName = typeof profileName === 'string' ? profileName.trim().slice(0, 40) : undefined
    const profileAvatar = [userData.data?.avatar_url, userData.data?.avatarUrl, userData.data?.avatar].find(value => typeof value === 'string' && value.trim())
    const avatarUrl = typeof profileAvatar === 'string' && /^https?:\/\//i.test(profileAvatar.trim()) ? profileAvatar.trim().slice(0, 2048) : undefined
    const store = getPersistence()
    const existing = await store.findByTokendanceSubject(subject)
    let user = existing ? await store.updateUser(existing.id, { tokendanceSubject: subject }) : null
    if (!user) {
      try {
        user = await store.createUser({ tokendanceSubject: subject, displayName, avatarUrl })
      } catch (error) {
        // Two callbacks can race after a user authorizes in multiple tabs. The
        // unique subject constraint makes the second request resolve to the
        // already-created account instead of failing the login.
        if (!isUniqueViolation(error)) throw error
        user = await store.findByTokendanceSubject(subject)
        if (!user) throw error
      }
    }
    if (store.syncWatchaProfile) {
      await store.syncWatchaProfile(user.id, { nickname: displayName, avatarUrl: avatarUrl || null })
    }
    const session = await store.createSession(user.id, COOKIE_TTL_SECONDS)
    const destination = new URL(parsedState.returnTo, new URL(callback).origin)
    const result = NextResponse.redirect(destination)
    result.headers.set('Cache-Control', 'no-store')
    result.headers.append('Set-Cookie', sessionCookieHeader(session.id, new Date(session.expiresAt), request))
    result.headers.append('Set-Cookie', oauthPkceCookieHeader('', 0, request))
    return result
  } catch (error) {
    if (isPersistenceUnavailable(error)) return NextResponse.json({ error: '账号服务尚未配置数据库或迁移尚未完成。' }, { status: 503 })
    return NextResponse.json({ error: '账号登录失败。' }, { status: 500 })
  }
}
