import { NextResponse } from 'next/server'
import { normalizeImportData } from '@/lib/backupValidation'
import { buildAssistantLearningContextWithSources } from '@/lib/assistantLearningContext'
import { sessionUserId } from '@/lib/server/sessionUser'
import { getPersistence, isPersistenceUnavailable } from '@/lib/server/persistence'

export const runtime = 'nodejs'

const MAX_QUERY_CHARS = 4000
const MAX_CONTEXT_CHARS = 12000

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const userId = await sessionUserId(request)
    if (!userId) return NextResponse.json({ error: '未登录。' }, { status: 401 })
    const payload = await request.json() as { query?: unknown; bookId?: unknown }
    if (typeof payload.query !== 'string' || !payload.query.trim() || payload.query.length > MAX_QUERY_CHARS) {
      return NextResponse.json({ error: '检索问题格式无效。' }, { status: 400 })
    }
    const store = getPersistence()
    if (!store.exportUserData) {
      return NextResponse.json({ context: '', sources: [] }, { headers: { 'Cache-Control': 'no-store' } })
    }
    const raw = await store.exportUserData(userId)
    const normalized = normalizeImportData(raw)
    if (!normalized.valid) {
      return NextResponse.json({ context: '', sources: [] }, { headers: { 'Cache-Control': 'no-store' } })
    }
    const selectedBook = typeof payload.bookId === 'string' && payload.bookId
      ? normalized.data.books.find(book => book.id === payload.bookId)
      : undefined
    if (!selectedBook) {
      return NextResponse.json({ context: '', sources: [] }, { headers: { 'Cache-Control': 'no-store' } })
    }
    const query = payload.query.trim()
    const learningContext = buildAssistantLearningContextWithSources(query, [selectedBook], selectedBook)
    const context = learningContext.context.slice(0, MAX_CONTEXT_CHARS)
    const sources = learningContext.sources
    return NextResponse.json({ context, sources }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (isPersistenceUnavailable(error)) return NextResponse.json({ error: '账号服务数据库尚未配置或迁移未完成。' }, { status: 503 })
    return NextResponse.json({ error: '读取个性化上下文失败。' }, { status: 500 })
  }
}
