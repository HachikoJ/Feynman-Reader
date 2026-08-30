import { NextResponse } from 'next/server'
import { sessionUserId } from '@/lib/server/sessionUser'
import { getPersistence, isPersistenceUnavailable } from '@/lib/server/persistence'

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
    if (!store.listAssistantSessions) return NextResponse.json({ error: '数据库尚未启用费曼小助手数据。' }, { status: 501 })
    return NextResponse.json({ sessions: await store.listAssistantSessions(userId) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return unavailable(error) || NextResponse.json({ error: '读取费曼小助手数据失败。' }, { status: 500 })
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  if (Number(request.headers.get('content-length') || 0) > 2 * 1024 * 1024) return NextResponse.json({ error: '会话数据超过 2 MB 限制。' }, { status: 413 })
  try {
    const userId = await sessionUserId(request)
    if (!userId) return NextResponse.json({ error: '未登录。' }, { status: 401 })
    const payload = await request.json() as { sessionId?: unknown; title?: unknown; bookId?: unknown; data?: unknown; createdAt?: unknown; updatedAt?: unknown }
    if (typeof payload.sessionId !== 'string' || !payload.sessionId.trim() || typeof payload.title !== 'string' || !payload.title.trim() || !Number.isFinite(payload.createdAt) || !Number.isFinite(payload.updatedAt)) {
      return NextResponse.json({ error: '会话数据格式无效。' }, { status: 400 })
    }
    let serializedData: string
    try {
      serializedData = JSON.stringify(payload.data)
    } catch {
      return NextResponse.json({ error: '会话数据无法序列化。' }, { status: 400 })
    }
    if (serializedData.length > 2 * 1024 * 1024) return NextResponse.json({ error: '会话数据超过 2 MB 限制。' }, { status: 413 })
    const store = getPersistence()
    if (!store.saveAssistantSession) return NextResponse.json({ error: '数据库尚未启用费曼小助手数据。' }, { status: 501 })
    await store.saveAssistantSession(userId, {
      sessionId: payload.sessionId.trim(),
      title: payload.title.trim().slice(0, 200),
      bookId: typeof payload.bookId === 'string' && payload.bookId.trim() ? payload.bookId.trim() : null,
      data: payload.data,
      createdAt: new Date(Number(payload.createdAt)).toISOString(),
      updatedAt: new Date(Number(payload.updatedAt)).toISOString(),
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return unavailable(error) || NextResponse.json({ error: '保存费曼小助手数据失败。' }, { status: 400 })
  }
}

export async function DELETE(request: Request): Promise<NextResponse> {
  try {
    const userId = await sessionUserId(request)
    if (!userId) return NextResponse.json({ error: '未登录。' }, { status: 401 })
    const store = getPersistence()
    if (!store.deleteAssistantSession || !store.clearAssistantSessions) return NextResponse.json({ error: '数据库尚未启用费曼小助手数据。' }, { status: 501 })
    const sessionId = new URL(request.url).searchParams.get('sessionId')
    if (sessionId) await store.deleteAssistantSession(userId, sessionId)
    else await store.clearAssistantSessions(userId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return unavailable(error) || NextResponse.json({ error: '删除费曼小助手数据失败。' }, { status: 400 })
  }
}
