import { NextResponse } from 'next/server'
import { normalizeImportData } from '@/lib/backupValidation'
import { getPersistence, isPersistenceUnavailable } from '@/lib/server/persistence'
import { sessionUserId } from '@/lib/server/sessionUser'

export const runtime = 'nodejs'

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const userId = await sessionUserId(request)
    if (!userId) return NextResponse.json({ error: '未登录。' }, { status: 401 })
    const store = getPersistence()
    if (!store.listUserBooks) return NextResponse.json({ error: '数据库尚未启用云端书架读取。' }, { status: 501 })
    const books = await store.listUserBooks(userId)
    return NextResponse.json({ books }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (isPersistenceUnavailable(error)) return NextResponse.json({ error: '账号服务数据库尚未配置或迁移未完成。' }, { status: 503 })
    return NextResponse.json({ error: '读取云端书架失败。' }, { status: 500 })
  }
}

export async function PUT(request: Request): Promise<NextResponse> {
  try {
    const userId = await sessionUserId(request)
    if (!userId) return NextResponse.json({ error: '未登录。' }, { status: 401 })
    if (Number(request.headers.get('content-length') || 0) > 20 * 1024 * 1024) {
      return NextResponse.json({ error: '书籍内容超过 20 MB 限制。' }, { status: 413 })
    }
    const payload = await request.json() as { book?: unknown }
    const normalized = normalizeImportData({
      version: 5,
      exportDate: Date.now(),
      settings: {},
      books: [payload.book],
      aiUsageRecords: [],
      bookLists: [],
      bookRelations: [],
      assistantSessions: [],
      assistantMemories: [],
    })
    if (!normalized.valid) return NextResponse.json({ error: normalized.error }, { status: 400 })
    const store = getPersistence()
    if (!store.saveBook) return NextResponse.json({ error: '数据库尚未启用云端书籍保存。' }, { status: 501 })
    await store.saveBook(userId, normalized.data.books[0])
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (isPersistenceUnavailable(error)) return NextResponse.json({ error: '账号服务数据库尚未配置或迁移未完成。' }, { status: 503 })
    return NextResponse.json({ error: error instanceof Error ? error.message : '保存云端书籍失败。' }, { status: 400 })
  }
}
