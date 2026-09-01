import { NextResponse } from 'next/server'
import { getPersistence } from '@/lib/server/persistence'
import { sessionUserId } from '@/lib/server/sessionUser'

export const runtime = 'nodejs'

interface Context { params: Promise<{ bookId: string }> }

export async function GET(request: Request, context: Context): Promise<NextResponse> {
  try {
    const userId = await sessionUserId(request)
    if (!userId) return NextResponse.json({ error: '未登录。' }, { status: 401 })
    const { bookId } = await context.params
    if (!/^[A-Za-z0-9._:-]{1,128}$/.test(bookId)) return NextResponse.json({ error: '书籍标识无效。' }, { status: 400 })
    const store = getPersistence()
    if (!store.getBook) return NextResponse.json({ error: '数据库尚未启用云端书籍读取。' }, { status: 501 })
    const book = await store.getBook(userId, bookId)
    if (!book) return NextResponse.json({ error: '书籍不存在。' }, { status: 404 })
    return NextResponse.json({ book }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof Error && error.message === 'Persistence adapter is not configured.') {
      return NextResponse.json({ error: '账号服务尚未配置数据库。' }, { status: 503 })
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : '读取云端书籍失败。' }, { status: 500 })
  }
}

export async function DELETE(request: Request, context: Context): Promise<NextResponse> {
  try {
    const userId = await sessionUserId(request)
    if (!userId) return NextResponse.json({ error: '未登录。' }, { status: 401 })
    const { bookId } = await context.params
    if (!/^[A-Za-z0-9._:-]{1,128}$/.test(bookId)) return NextResponse.json({ error: '书籍标识无效。' }, { status: 400 })
    const store = getPersistence()
    if (!store.softDeleteBook) return NextResponse.json({ error: '数据库尚未启用书籍回收站。' }, { status: 501 })
    await store.softDeleteBook(userId, bookId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'Persistence adapter is not configured.') {
      return NextResponse.json({ error: '账号服务尚未配置数据库。' }, { status: 503 })
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : '删除书籍失败。' }, { status: 400 })
  }
}
