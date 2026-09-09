import { NextResponse } from 'next/server'
import { normalizeBookLists, normalizeBookRelations } from '@/lib/backupValidation'
import { getPersistence, isPersistenceUnavailable } from '@/lib/server/persistence'
import { sessionUserId } from '@/lib/server/sessionUser'

export const runtime = 'nodejs'

function failure(error: unknown): NextResponse {
  if (isPersistenceUnavailable(error)) return NextResponse.json({ error: '账号服务数据库尚未配置或迁移未完成。' }, { status: 503 })
  return NextResponse.json({ error: error instanceof Error ? error.message : '保存书单或书籍关系失败。' }, { status: 400 })
}

export async function PUT(request: Request): Promise<NextResponse> {
  try {
    const userId = await sessionUserId(request)
    if (!userId) return NextResponse.json({ error: '未登录。' }, { status: 401 })
    const payload = await request.json() as { kind?: unknown; record?: unknown }
    const store = getPersistence()
    if (payload.kind === 'list') {
      const normalized = normalizeBookLists([payload.record])
      if (!normalized.valid) return NextResponse.json({ error: normalized.error }, { status: 400 })
      if (!store.saveBookList) return NextResponse.json({ error: '数据库尚未启用书单保存。' }, { status: 501 })
      await store.saveBookList(userId, normalized.data[0])
    } else if (payload.kind === 'relation') {
      const normalized = normalizeBookRelations([payload.record])
      if (!normalized.valid) return NextResponse.json({ error: normalized.error }, { status: 400 })
      if (!store.saveBookRelation) return NextResponse.json({ error: '数据库尚未启用书籍关系保存。' }, { status: 501 })
      await store.saveBookRelation(userId, normalized.data[0])
    } else return NextResponse.json({ error: '书籍组织类型无效。' }, { status: 400 })
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return failure(error) }
}

export async function DELETE(request: Request): Promise<NextResponse> {
  try {
    const userId = await sessionUserId(request)
    if (!userId) return NextResponse.json({ error: '未登录。' }, { status: 401 })
    const payload = await request.json() as { kind?: unknown; id?: unknown }
    if (typeof payload.id !== 'string' || payload.id.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(payload.id)) {
      return NextResponse.json({ error: '记录 ID 无效。' }, { status: 400 })
    }
    const store = getPersistence()
    if (payload.kind === 'list') {
      if (!store.deleteBookList) return NextResponse.json({ error: '数据库尚未启用书单删除。' }, { status: 501 })
      await store.deleteBookList(userId, payload.id)
    } else if (payload.kind === 'relation') {
      if (!store.deleteBookRelation) return NextResponse.json({ error: '数据库尚未启用书籍关系删除。' }, { status: 501 })
      await store.deleteBookRelation(userId, payload.id)
    } else return NextResponse.json({ error: '书籍组织类型无效。' }, { status: 400 })
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return failure(error) }
}
