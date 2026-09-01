import { NextResponse } from 'next/server'
import { getPersistence, isPersistenceUnavailable } from '@/lib/server/persistence'
import { sessionUserId } from '@/lib/server/sessionUser'

export const runtime = 'nodejs'

async function userId(request: Request): Promise<string | null> {
  return sessionUserId(request)
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const id = await userId(request)
    if (!id) return NextResponse.json({ error: '未登录。' }, { status: 401 })
    const store = getPersistence()
    if (!store.listRecycleBin) return NextResponse.json({ error: '数据库尚未启用回收站。' }, { status: 501 })
    const items = await store.listRecycleBin(id)
    // Keep server retention timestamps private; the browser only needs the
    // user's content and the time it was moved to the recycle bin.
    return NextResponse.json({ items: items.map(item => ({
      bookId: item.bookId,
      name: item.name,
      author: item.author,
      deletedAt: item.deletedAt,
      // This is the user-facing restore deadline, distinct from the private
      // server purge timestamp retained for storage housekeeping.
      restoreUntil: new Date(new Date(item.deletedAt).getTime() + 7 * 86400000).toISOString(),
    })) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[account/recycle-bin] read failed', {
      code: error && typeof error === 'object' && 'code' in error ? String((error as { code?: unknown }).code || '') : '',
      message: error instanceof Error ? error.message : String(error),
    })
    if (isPersistenceUnavailable(error)) return NextResponse.json({ error: '账号服务数据库尚未配置或迁移未完成。' }, { status: 503 })
    return NextResponse.json({ error: '读取回收站失败。' }, { status: 500 })
  }
}

export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    const id = await userId(request)
    if (!id) return NextResponse.json({ error: '未登录。' }, { status: 401 })
    const body = await request.json() as { bookId?: unknown; action?: unknown }
    if (typeof body.bookId !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(body.bookId)) return NextResponse.json({ error: '书籍标识无效。' }, { status: 400 })
    const store = getPersistence()
    if (body.action === 'restore') await store.restoreBook?.(id, body.bookId)
    else if (body.action === 'delete') await store.permanentlyDeleteBook?.(id, body.bookId)
    else return NextResponse.json({ error: '操作无效。' }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (isPersistenceUnavailable(error)) return NextResponse.json({ error: '账号服务数据库尚未配置或迁移未完成。' }, { status: 503 })
    return NextResponse.json({ error: error instanceof Error ? error.message : '回收站操作失败。' }, { status: 400 })
  }
}
