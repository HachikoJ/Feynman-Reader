import { NextResponse } from 'next/server'
import { normalizeUsername, verifyPassword } from '@/lib/server/auth'
import { isWatchaOAuthEnabled } from '@/lib/server/authConfig'
import { getPersistence, isPersistenceUnavailable } from '@/lib/server/persistence'
import { sessionUserId } from '@/lib/server/sessionUser'

export const runtime = 'nodejs'

export async function POST(request: Request): Promise<NextResponse> {
  if (!isWatchaOAuthEnabled()) return NextResponse.json({ error: '观猹登录开放后才可迁移原账号。' }, { status: 403 })
  try {
    const targetUserId = await sessionUserId(request)
    if (!targetUserId) return NextResponse.json({ error: '请先使用观猹账号登录。' }, { status: 401 })
    const store = getPersistence()
    const target = await store.findUserById(targetUserId)
    if (!target?.tokendanceSubject) return NextResponse.json({ error: '当前不是观猹账号，请退出后使用观猹登录。' }, { status: 403 })
    if (!store.findPasswordHashByUsername || !store.mergePasswordAccountIntoWatchaAccount) {
      return NextResponse.json({ error: '账号迁移功能尚未启用。' }, { status: 501 })
    }
    const body = await request.json() as { username?: unknown; password?: unknown; confirm?: unknown }
    if (body.confirm !== true) return NextResponse.json({ error: '请确认迁移后原账号将永久停用。' }, { status: 400 })
    const username = normalizeUsername(typeof body.username === 'string' ? body.username : '')
    const password = typeof body.password === 'string' ? body.password : ''
    const source = await store.findByUsername(username)
    const passwordHash = await store.findPasswordHashByUsername(username)
    if (!source || !passwordHash || !verifyPassword(password, passwordHash)) {
      return NextResponse.json({ error: '原账号用户名或密码错误。' }, { status: 401 })
    }
    if (source.tokendanceSubject || !source.hasPassword) {
      return NextResponse.json({ error: '只能迁移备案期间创建的用户名密码账号。' }, { status: 400 })
    }
    const result = await store.mergePasswordAccountIntoWatchaAccount(source.id, targetUserId)
    return NextResponse.json({ ok: true, result }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (isPersistenceUnavailable(error)) return NextResponse.json({ error: '账号服务数据库尚未配置或迁移未完成。' }, { status: 503 })
    return NextResponse.json({ error: error instanceof Error ? error.message : '账号迁移失败。' }, { status: 400 })
  }
}
