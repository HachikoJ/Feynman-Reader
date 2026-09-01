import { NextResponse } from 'next/server'
import { COOKIE_TTL_SECONDS, normalizeUsername, sessionCookieHeader, verifyPassword } from '@/lib/server/auth'
import { getPersistence, isPersistenceUnavailable } from '@/lib/server/persistence'
import { isPasswordAuthEnabled } from '@/lib/server/authConfig'

export const runtime = 'nodejs'

export async function POST(request: Request): Promise<NextResponse> {
  if (!isPasswordAuthEnabled()) return NextResponse.json({ error: '用户名密码登录已停用，请使用观猹登录。' }, { status: 403 })
  try {
    const body = await request.json() as { username?: unknown; password?: unknown }
    const username = normalizeUsername(typeof body.username === 'string' ? body.username : '')
    const password = typeof body.password === 'string' ? body.password : ''
    const store = getPersistence()
    const user = await store.findByUsername(username)
    const hash = store.findPasswordHashByUsername ? await store.findPasswordHashByUsername(username) : null
    if (!user || !hash || !verifyPassword(password, hash)) return NextResponse.json({ error: '用户名或密码错误。' }, { status: 401 })
    const session = await store.createSession(user.id, COOKIE_TTL_SECONDS)
    const response = NextResponse.json({ user })
    response.headers.append('Set-Cookie', sessionCookieHeader(session.id, new Date(session.expiresAt), request))
    return response
  } catch (error) {
    if (isPersistenceUnavailable(error)) return NextResponse.json({ error: '账号服务数据库尚未配置或迁移未完成。' }, { status: 503 })
    return NextResponse.json({ error: error instanceof Error ? error.message : '登录失败。' }, { status: 400 })
  }
}
