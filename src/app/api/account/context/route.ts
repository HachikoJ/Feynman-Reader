import { NextResponse } from 'next/server'
import { normalizeImportData } from '@/lib/backupValidation'
import { buildAssistantLearningContext } from '@/lib/assistantLearningContext'
import { sessionUserId } from '@/lib/server/sessionUser'
import { getPersistence, isPersistenceUnavailable } from '@/lib/server/persistence'

export const runtime = 'nodejs'

const MAX_QUERY_CHARS = 4000
const MAX_CONTEXT_CHARS = 12000

function rankedSnippets(values: string[], query: string, limit: number, maxChars: number): string[] {
  const terms = query.toLocaleLowerCase().split(/\s+/u).filter(Boolean)
  return values.map(value => ({ value, score: terms.reduce((score, term) => score + (value.toLocaleLowerCase().includes(term) ? 1 : 0), 0) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || b.value.length - a.value.length)
    .slice(0, limit)
    .reduce<string[]>((result, item) => {
      const used = result.join('\n\n').length
      if (used < maxChars) result.push(item.value.slice(0, Math.max(0, maxChars - used)))
      return result
    }, [])
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const userId = await sessionUserId(request)
    if (!userId) return NextResponse.json({ error: '未登录。' }, { status: 401 })
    const payload = await request.json() as { query?: unknown; bookId?: unknown }
    if (typeof payload.query !== 'string' || !payload.query.trim() || payload.query.length > MAX_QUERY_CHARS) {
      return NextResponse.json({ error: '检索问题格式无效。' }, { status: 400 })
    }
    const store = getPersistence()
    if (!store.exportUserData) return NextResponse.json({ context: '' }, { headers: { 'Cache-Control': 'no-store' } })
    const raw = await store.exportUserData(userId)
    const normalized = normalizeImportData(raw)
    if (!normalized.valid) return NextResponse.json({ context: '' }, { headers: { 'Cache-Control': 'no-store' } })
    const selectedBook = typeof payload.bookId === 'string' ? normalized.data.books.find(book => book.id === payload.bookId) : undefined
    const query = payload.query.trim()
    let context = buildAssistantLearningContext(query, normalized.data.books, selectedBook || null)
    if (!context) {
      const recentBooks = normalized.data.books.slice().sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 3)
      context = recentBooks.map(book => `书籍概览：${book.name}\n作者：${book.author || '未知'}\n简介：${book.description || '暂无'}\n学习阶段：${book.currentPhase}/6`).join('\n\n')
    }
    const rawRecord = raw && typeof raw === 'object' ? raw as { settings?: { quotes?: unknown }; assistantSessions?: unknown } : {}
    const quoteSnippets = Array.isArray(rawRecord.settings?.quotes)
      ? rankedSnippets(rawRecord.settings.quotes.flatMap(item => item && typeof item === 'object' && typeof (item as { text?: unknown }).text === 'string' ? [`金句：${(item as { text: string }).text}（${typeof (item as { author?: unknown }).author === 'string' ? (item as { author: string }).author : '未知作者'}）`] : []), query, 5, 2200)
      : []
    const sessionSnippets = Array.isArray(rawRecord.assistantSessions)
      ? rankedSnippets(rawRecord.assistantSessions.flatMap(item => {
        if (!item || typeof item !== 'object') return []
        const data = item as { title?: unknown; data?: { messages?: unknown[] } }
        const title = typeof data.title === 'string' ? data.title : '未命名会话'
        const messages = Array.isArray(data.data?.messages) ? data.data.messages.slice(-4).flatMap(message => message && typeof message === 'object' && typeof (message as { content?: unknown }).content === 'string' ? [`会话「${title}」：${(message as { content: string }).content}`] : []) : []
        return messages
      }), query, 4, 3600)
      : []
    if (quoteSnippets.length) context += `\n\n相关金句：\n${quoteSnippets.join('\n')}`
    if (sessionSnippets.length) context += `\n\n相关历史会话：\n${sessionSnippets.join('\n')}`
    context = context.slice(0, MAX_CONTEXT_CHARS)
    return NextResponse.json({ context }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (isPersistenceUnavailable(error)) return NextResponse.json({ error: '账号服务数据库尚未配置或迁移未完成。' }, { status: 503 })
    return NextResponse.json({ error: '读取个性化上下文失败。' }, { status: 500 })
  }
}
