import { NextResponse } from 'next/server'
import { getPersistence } from '@/lib/server/persistence'
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
    await store.purgeRecycleBin?.(id)
    return NextResponse.json({ items: await store.listRecycleBin(id) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof Error && error.message === 'Persistence adapter is not configured.') return NextResponse.json({ error: '账号服务尚未配置数据库。' }, { status: 503 })
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
    if (error instanceof Error && error.message === 'Persistence adapter is not configured.') return NextResponse.json({ error: '账号服务尚未配置数据库。' }, { status: 503 })
    return NextResponse.json({ error: error instanceof Error ? error.message : '回收站操作失败。' }, { status: 400 })
  }
}
