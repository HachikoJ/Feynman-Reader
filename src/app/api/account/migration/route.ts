import { NextResponse } from 'next/server'
import { getPersistence, isPersistenceUnavailable } from '@/lib/server/persistence'
import { sessionUserId } from '@/lib/server/sessionUser'

export const runtime = 'nodejs'

function unavailable(error: unknown): NextResponse | null {
    return isPersistenceUnavailable(error)
      ? NextResponse.json({ error: '账号服务数据库尚未配置或迁移未完成。' }, { status: 503 })
    : null
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const userId = await sessionUserId(request)
    if (!userId) return NextResponse.json({ error: '未登录。' }, { status: 401 })
    const store = getPersistence()
    if (!store.getMigrationState) return NextResponse.json({ error: '数据库尚未启用迁移功能。' }, { status: 501 })
    const activate = new URL(request.url).searchParams.get('activate') === '1'
    return NextResponse.json(await store.getMigrationState(userId, activate), { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return unavailable(error) || NextResponse.json({ error: '读取迁移状态失败。' }, { status: 500 })
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  if (Number(request.headers.get('content-length') || 0) > 20 * 1024 * 1024) return NextResponse.json({ error: '迁移数据超过 20 MB 限制。' }, { status: 413 })
  try {
    const userId = await sessionUserId(request)
    if (!userId) return NextResponse.json({ error: '未登录。' }, { status: 401 })
    const store = getPersistence()
    if (!store.migrateUserData) return NextResponse.json({ error: '数据库尚未启用迁移功能。' }, { status: 501 })
    const payload = await request.json()
    return NextResponse.json(await store.migrateUserData(userId, payload))
  } catch (error) {
    return unavailable(error) || NextResponse.json({ error: error instanceof Error ? error.message : '历史数据迁移失败。' }, { status: 400 })
  }
}
