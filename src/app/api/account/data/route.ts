import { NextResponse } from 'next/server'
import { sessionCookieName } from '@/lib/server/auth'
import { getPersistence } from '@/lib/server/persistence'

export const runtime = 'nodejs'

async function sessionUserId(request: Request): Promise<string | null> {
  const part = (request.headers.get('cookie') || '').split(';').map(value => value.trim()).find(value => value.startsWith(`${sessionCookieName()}=`))
  if (!part) return null
  const session = await getPersistence().findSession(decodeURIComponent(part.slice(sessionCookieName().length + 1)))
  return session && Date.parse(session.expiresAt) > Date.now() ? session.userId : null
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const userId = await sessionUserId(request)
    if (!userId) return NextResponse.json({ error: '未登录。' }, { status: 401 })
    const store = getPersistence()
    if (!store.getUserDataSummary) return NextResponse.json({ error: '数据库尚未启用云端数据。' }, { status: 501 })
    return NextResponse.json(await store.getUserDataSummary(userId), { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof Error && error.message === 'Persistence adapter is not configured.') return NextResponse.json({ error: '账号服务尚未配置数据库。' }, { status: 503 })
    return NextResponse.json({ error: '读取云端数据失败。' }, { status: 500 })
  }
}
