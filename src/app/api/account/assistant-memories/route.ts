import { NextResponse } from 'next/server'
import { sessionUserId } from '@/lib/server/sessionUser'
import { getPersistence, isPersistenceUnavailable, type AssistantMemoryRecord } from '@/lib/server/persistence'

export const runtime = 'nodejs'

function unavailable(error: unknown): NextResponse | null {
  return isPersistenceUnavailable(error)
    ? NextResponse.json({ error: '账号服务数据库尚未配置或迁移未完成。' }, { status: 503 })
    : null
}

function timestamp(value: unknown): number | null {
  const result = typeof value === 'number' ? value : typeof value === 'string' ? Date.parse(value) : NaN
  return Number.isFinite(result) && result >= 0 ? result : null
}

const UNSAFE_MEMORY = /(api\s*key|access[\s_-]*key|token\s*[:=]|password|credential|密码|密钥|私钥|secret|system prompt|系统提示词)/iu

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const userId = await sessionUserId(request)
    if (!userId) return NextResponse.json({ error: '未登录。' }, { status: 401 })
    const store = getPersistence()
    if (!store.listAssistantMemories) return NextResponse.json({ error: '数据库尚未启用长期记忆。' }, { status: 501 })
    return NextResponse.json({ memories: await store.listAssistantMemories(userId) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return unavailable(error) || NextResponse.json({ error: '读取长期记忆失败。' }, { status: 500 })
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const userId = await sessionUserId(request)
    if (!userId) return NextResponse.json({ error: '未登录。' }, { status: 401 })
    const payload = await request.json() as Partial<AssistantMemoryRecord>
    const category = payload.category
    const createdAt = timestamp(payload.createdAt)
    const updatedAt = timestamp(payload.updatedAt)
    if (
      typeof payload.memoryId !== 'string' || !payload.memoryId.trim() ||
      payload.memoryId.trim().length > 128 ||
      typeof payload.content !== 'string' || !payload.content.trim() || payload.content.trim().length > 500 ||
      UNSAFE_MEMORY.test(payload.content) ||
      !category || !['preference', 'learning-style', 'goal', 'workflow'].includes(category) ||
      createdAt === null || updatedAt === null
    ) return NextResponse.json({ error: '长期记忆数据格式无效。' }, { status: 400 })
    const store = getPersistence()
    if (!store.saveAssistantMemory) return NextResponse.json({ error: '数据库尚未启用长期记忆。' }, { status: 501 })
    await store.saveAssistantMemory(userId, {
      memoryId: payload.memoryId.trim(),
      content: payload.content.trim(),
      category,
      sourceSessionId: typeof payload.sourceSessionId === 'string' && payload.sourceSessionId.trim() ? payload.sourceSessionId.trim().slice(0, 128) : null,
      createdAt: new Date(createdAt).toISOString(),
      updatedAt: new Date(updatedAt).toISOString(),
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return unavailable(error) || NextResponse.json({ error: '保存长期记忆失败。' }, { status: 400 })
  }
}

export async function DELETE(request: Request): Promise<NextResponse> {
  try {
    const userId = await sessionUserId(request)
    if (!userId) return NextResponse.json({ error: '未登录。' }, { status: 401 })
    const store = getPersistence()
    if (!store.deleteAssistantMemory || !store.clearAssistantMemories) return NextResponse.json({ error: '数据库尚未启用长期记忆。' }, { status: 501 })
    const memoryId = new URL(request.url).searchParams.get('memoryId')
    if (memoryId) await store.deleteAssistantMemory(userId, memoryId)
    else await store.clearAssistantMemories(userId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return unavailable(error) || NextResponse.json({ error: '删除长期记忆失败。' }, { status: 400 })
  }
}
