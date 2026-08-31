import { NextResponse } from 'next/server'
import { COOKIE_TTL_SECONDS, hashPassword, normalizeEmail, normalizeUsername, sessionCookieHeader } from '@/lib/server/auth'
import { getPersistence, isPersistenceUnavailable } from '@/lib/server/persistence'

export const runtime = 'nodejs'

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === '23505')
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await request.json() as { username?: unknown; password?: unknown; email?: unknown }
    const username = normalizeUsername(typeof body.username === 'string' ? body.username : '')
    const passwordHash = hashPassword(typeof body.password === 'string' ? body.password : '')
    const email = normalizeEmail(typeof body.email === 'string' ? body.email : '')
    const store = getPersistence()
    if (await store.findByUsername(username)) return NextResponse.json({ error: '用户名已被使用。' }, { status: 409 })
    if (await store.findByEmail(email)) return NextResponse.json({ error: '邮箱已被使用。' }, { status: 409 })
    const user = await store.createUser({ username, passwordHash, email, displayName: username })
    if (store.saveUserProfilePatch) await store.saveUserProfilePatch(user.id, { customDisplayName: username })
    const savedUser = await store.findUserById(user.id)
    const session = await store.createSession(user.id, COOKIE_TTL_SECONDS)
    const response = NextResponse.json({ user: savedUser || user }, { status: 201 })
    response.headers.append('Set-Cookie', sessionCookieHeader(session.id, new Date(session.expiresAt), request))
    return response
  } catch (error) {
    if (isUniqueViolation(error)) return NextResponse.json({ error: '用户名或邮箱已被使用。' }, { status: 409 })
    if (isPersistenceUnavailable(error)) return NextResponse.json({ error: '账号服务数据库尚未配置或迁移未完成。' }, { status: 503 })
    return NextResponse.json({ error: error instanceof Error ? error.message : '注册失败。' }, { status: 400 })
  }
}
