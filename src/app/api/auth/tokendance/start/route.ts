import { NextResponse } from 'next/server'
import { createOAuthState, oauthPkceCookieHeader, safeAuthReturnTo } from '@/lib/server/auth'
import { getTokendanceCallbackUrl, isWatchaOAuthEnabled, TOKENDANCE_OAUTH_AUTHORIZE_URL, TOKENDANCE_OAUTH_SCOPE } from '@/lib/server/authConfig'
import { createHash, randomBytes } from 'node:crypto'

export const runtime = 'nodejs'

export async function GET(request: Request): Promise<NextResponse> {
  if (!isWatchaOAuthEnabled()) return NextResponse.json({ error: '观猹登录暂时关闭，请使用用户名和密码登录。' }, { status: 503 })
  const clientId = process.env.TOKENDANCE_OAUTH_CLIENT_ID?.trim()
  if (!clientId || !process.env.FEYNMAN_AUTH_STATE_SECRET?.trim()) return NextResponse.json({ error: '观猹登录尚未配置。' }, { status: 503 })
  let target: URL
  try { target = new URL(process.env.TOKENDANCE_OAUTH_AUTHORIZE_URL?.trim() || TOKENDANCE_OAUTH_AUTHORIZE_URL) } catch { return NextResponse.json({ error: '观猹登录地址配置无效。' }, { status: 503 }) }
  const callback = getTokendanceCallbackUrl(request)
  const requestUrl = new URL(request.url)
  const explicitReturnTo = requestUrl.searchParams.get('returnTo')
  let referrerReturnTo: string | null = null
  if (!explicitReturnTo) {
    try {
      const referrer = new URL(request.headers.get('referer') || '')
      if (referrer.origin === requestUrl.origin && !referrer.pathname.startsWith('/api/auth/')) {
        referrerReturnTo = `${referrer.pathname}${referrer.search}${referrer.hash}`
      }
    } catch { /* missing or invalid referrer falls back to the homepage */ }
  }
  const returnTo = safeAuthReturnTo(explicitReturnTo || referrerReturnTo)
  const nonce = randomBytes(16).toString('base64url')
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const state = createOAuthState({ nonce, callback, returnTo, issuedAt: Date.now() })
  target.searchParams.set('redirect_uri', callback)
  target.searchParams.set('state', state)
  target.searchParams.set('client_id', clientId)
  target.searchParams.set('response_type', 'code')
  target.searchParams.set('scope', TOKENDANCE_OAUTH_SCOPE)
  target.searchParams.set('code_challenge', challenge)
  target.searchParams.set('code_challenge_method', 'S256')
  const response = NextResponse.redirect(target)
  response.headers.set('Cache-Control', 'no-store')
  response.headers.append('Set-Cookie', oauthPkceCookieHeader(`${nonce}.${verifier}`, 600, request))
  return response
}
