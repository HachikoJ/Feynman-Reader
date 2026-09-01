import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/server/adminAuth'
import { getPersistence, isPersistenceUnavailable } from '@/lib/server/persistence'

export const runtime = 'nodejs'

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const auth = await requireAdminSession(request)
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const store = getPersistence()
    if (!store.getAdminDashboard) return NextResponse.json({ error: '管理员看板尚未配置完成。' }, { status: 503 })
    const dashboard = await store.getAdminDashboard()
    if (store.writeAdminAuditLog) await store.writeAdminAuditLog({ adminUserId: auth.userId, action: 'admin_dashboard_viewed' })
    return NextResponse.json(dashboard, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (isPersistenceUnavailable(error)) return NextResponse.json({ error: '账号服务数据库尚未配置或管理员迁移未完成。' }, { status: 503 })
    return NextResponse.json({ error: '读取管理员看板失败。' }, { status: 500 })
  }
}
