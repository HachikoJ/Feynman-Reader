import { NextResponse } from 'next/server'
import { normalizeAIUsageRecords } from '@/lib/backupValidation'
import { getPersistence, isPersistenceUnavailable } from '@/lib/server/persistence'
import { sessionUserId } from '@/lib/server/sessionUser'

export const runtime = 'nodejs'

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const userId = await sessionUserId(request)
    if (!userId) return NextResponse.json({ error: '未登录。' }, { status: 401 })
    const body = await request.text()
    if (body.length > 16 * 1024) return NextResponse.json({ error: 'AI 用量记录超过大小限制。' }, { status: 413 })
    let payload: unknown
    try { payload = JSON.parse(body) } catch { return NextResponse.json({ error: 'AI 用量记录格式无效。' }, { status: 400 }) }
    const record = payload && typeof payload === 'object' && !Array.isArray(payload) ? (payload as { record?: unknown }).record : undefined
    const normalized = normalizeAIUsageRecords([record])
    if (!normalized.valid) return NextResponse.json({ error: normalized.error }, { status: 400 })
    const value = normalized.data[0]
    if ([value.promptTokens, value.completionTokens, value.totalTokens].some(tokens => tokens > 2_147_483_647)) {
      return NextResponse.json({ error: 'AI 用量记录超过单条存储限制。' }, { status: 400 })
    }
    const store = getPersistence()
    if (!store.saveAIUsageRecord) return NextResponse.json({ error: '数据库尚未启用 AI 用量记录保存。' }, { status: 501 })
    await store.saveAIUsageRecord(userId, value)
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (isPersistenceUnavailable(error)) return NextResponse.json({ error: '账号服务数据库尚未配置或迁移未完成。' }, { status: 503 })
    return NextResponse.json({ error: '保存 AI 用量记录失败，请重试。' }, { status: 500 })
  }
}
