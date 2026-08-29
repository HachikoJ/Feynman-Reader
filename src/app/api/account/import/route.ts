import { NextResponse } from 'next/server'
import { sessionCookieName } from '@/lib/server/auth'
import { getPersistence } from '@/lib/server/persistence'

export const runtime = 'nodejs'

async function sessionUserId(request: Request): Promise<string | null> {
  const raw = request.headers.get('cookie') || ''
  const part = raw.split(';').map(value => value.trim()).find(value => value.startsWith(`${sessionCookieName()}=`))
  if (!part) return null
  const id = decodeURIComponent(part.slice(sessionCookieName().length + 1))
  const session = await getPersistence().findSession(id)
  return session && Date.parse(session.expiresAt) > Date.now() ? session.userId : null
}

export async function POST(request: Request): Promise<NextResponse> {
  if (Number(request.headers.get('content-length') || 0) > 20 * 1024 * 1024) return NextResponse.json({ error: '导入文件超过 20 MB 限制。' }, { status: 413 })
  try {
    const userId = await sessionUserId(request)
    if (!userId) return NextResponse.json({ error: '未登录。' }, { status: 401 })
    const payload = await request.json() as { settings?: unknown; books?: unknown[]; aiUsageRecords?: unknown[]; bookLists?: unknown[]; bookRelations?: unknown[]; version?: unknown; exportDate?: unknown }
    if (!Array.isArray(payload.books) || payload.books.length > 10000 || !Number.isInteger(payload.version) || !Number.isFinite(payload.exportDate)) return NextResponse.json({ error: '导入文件格式无效。' }, { status: 400 })
    const store = getPersistence()
    if (!store.importUserData) return NextResponse.json({ error: '数据库尚未启用数据导入适配器。' }, { status: 501 })
    const result = await store.importUserData(userId, payload)
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    if (error instanceof Error && error.message === 'Persistence adapter is not configured.') return NextResponse.json({ error: '账号服务尚未配置数据库。' }, { status: 503 })
    return NextResponse.json({ error: '数据导入失败。' }, { status: 400 })
  }
}
