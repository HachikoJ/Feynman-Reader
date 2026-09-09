import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/server/adminAuth'
import { ADMIN_DATA_TABLES, getAdminDataPage, getAdminDataRecord, AdminDataError } from '@/lib/server/adminData'
import { getPersistence } from '@/lib/server/persistence'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const auth = await requireAdminSession(request)
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: { 'Cache-Control': 'no-store' } })
    const params = new URL(request.url).searchParams
    const table = params.get('table') || ''
    const key = params.get('record') || ''
    const result = !table ? { tables: ADMIN_DATA_TABLES } : key ? await getAdminDataRecord(table, key) : await getAdminDataPage({
      table, userId: params.get('userId') || undefined, search: params.get('search') || undefined,
      page: Number(params.get('page') || 1), pageSize: Number(params.get('pageSize') || 25),
      from: params.get('from') || undefined, to: params.get('to') || undefined,
      sort: params.get('sort') === 'oldest' ? 'oldest' : 'newest',
    })
    await getPersistence().writeAdminAuditLog?.({ adminUserId: auth.userId, action: key ? 'admin_record_viewed' : 'admin_table_viewed', metadata: { table, record: key } })
    return NextResponse.json(result, { status: result === null ? 404 : 200, headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof AdminDataError ? error.message : '读取管理数据失败，请重试。' }, { status: error instanceof AdminDataError ? error.status : 500, headers: { 'Cache-Control': 'no-store' } })
  }
}
