import { NextResponse } from 'next/server'
import { hashPassword, sessionCookieName, verifyPassword } from '@/lib/server/auth'
import { getPersistence, isPersistenceUnavailable } from '@/lib/server/persistence'
import { isPasswordAuthEnabled } from '@/lib/server/authConfig'

export const runtime = 'nodejs'

async function currentUserId(request: Request): Promise<string | null> {
  const part = (request.headers.get('cookie') || '').split(';').map(value => value.trim()).find(value => value.startsWith(`${sessionCookieName()}=`))
  if (!part) return null
  const session = await getPersistence().findSession(decodeURIComponent(part.slice(sessionCookieName().length + 1)))
  return session && Date.parse(session.expiresAt) > Date.now() ? session.userId : null
}

export async function PATCH(request: Request): Promise<NextResponse> {
  if (!isPasswordAuthEnabled()) return NextResponse.json({ error: '用户名密码账号已停止维护，请迁移至观猹账号。' }, { status: 403 })
  try {
    const userId = await currentUserId(request)
    if (!userId) return NextResponse.json({ error: '未登录。' }, { status: 401 })
    const body = await request.json() as { currentPassword?: unknown; newPassword?: unknown }
    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : ''
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : ''
    const store = getPersistence()
    const user = await store.findUserById(userId)
    if (!user?.username || !store.findPasswordHashByUsername || !store.updatePasswordHash) {
      return NextResponse.json({ error: '当前账号不支持修改密码。' }, { status: 400 })
    }
    const passwordHash = await store.findPasswordHashByUsername(user.username)
    if (!passwordHash || !verifyPassword(currentPassword, passwordHash)) {
      return NextResponse.json({ error: '当前密码不正确。' }, { status: 400 })
    }
    await store.updatePasswordHash(userId, hashPassword(newPassword))
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (isPersistenceUnavailable(error)) return NextResponse.json({ error: '账号服务数据库尚未配置或迁移未完成。' }, { status: 503 })
    return NextResponse.json({ error: error instanceof Error ? error.message : '修改密码失败。' }, { status: 400 })
  }
}
