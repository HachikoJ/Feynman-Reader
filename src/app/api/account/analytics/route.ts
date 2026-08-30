import { NextResponse } from 'next/server'
import { sessionUserId } from '@/lib/server/sessionUser'
import { getPersistence } from '@/lib/server/persistence'

export const runtime = 'nodejs'

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const userId = await sessionUserId(request)
    if (!userId) return NextResponse.json({ error: '未登录。' }, { status: 401 })
    const payload = await request.json() as { eventType?: unknown; payload?: unknown; occurredAt?: unknown }
    if (typeof payload.eventType !== 'string' || !payload.eventType.trim() || payload.eventType.length > 80) {
      return NextResponse.json({ error: '行为事件格式无效。' }, { status: 400 })
    }
    const occurredAt = typeof payload.occurredAt === 'string' && !Number.isNaN(Date.parse(payload.occurredAt)) ? new Date(payload.occurredAt).toISOString() : undefined
    const store = getPersistence()
    if (!store.recordBehaviorEvent) return NextResponse.json({ error: '数据库尚未启用个性化分析。' }, { status: 501 })
    await store.recordBehaviorEvent(userId, payload.eventType, payload.payload, occurredAt)
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'Persistence adapter is not configured.') return NextResponse.json({ error: '账号服务尚未配置数据库。' }, { status: 503 })
    return NextResponse.json({ error: '记录行为分析失败。' }, { status: 400 })
  }
}
