import { NextResponse } from 'next/server'
import { sessionCookieName } from '@/lib/server/auth'
import { getPersistence, isPersistenceUnavailable } from '@/lib/server/persistence'

export const runtime = 'nodejs'

async function sessionUserId(request: Request): Promise<string | null> {
  const part = (request.headers.get('cookie') || '').split(';').map(value => value.trim()).find(value => value.startsWith(`${sessionCookieName()}=`))
  if (!part) return null
  const session = await getPersistence().findSession(decodeURIComponent(part.slice(sessionCookieName().length + 1)))
  return session && Date.parse(session.expiresAt) > Date.now() ? session.userId : null
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const userId = await sessionUserId(request)
    if (!userId) return NextResponse.json({ error: '未登录。' }, { status: 401 })
    const store = getPersistence()
    const format = new URL(request.url).searchParams.get('format')
    if (format === 'settings') {
      if (!store.getUserSettings) return NextResponse.json({ error: '数据库尚未启用云端设置读取。' }, { status: 501 })
      return NextResponse.json({ settings: await store.getUserSettings(userId) }, { headers: { 'Cache-Control': 'no-store' } })
    }
    if (format === 'full' || format === 'core') {
      if (!store.exportUserData) return NextResponse.json({ error: '数据库尚未启用云端数据读取。' }, { status: 501 })
      return NextResponse.json(await store.exportUserData(userId, format), { headers: { 'Cache-Control': 'no-store' } })
    }
    if (!store.getUserDataSummary) return NextResponse.json({ error: '数据库尚未启用云端数据。' }, { status: 501 })
    return NextResponse.json(await store.getUserDataSummary(userId), { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[account/data] read failed', {
      format: new URL(request.url).searchParams.get('format') || 'summary',
      code: error && typeof error === 'object' && 'code' in error ? String((error as { code?: unknown }).code || '') : '',
      message: error instanceof Error ? error.message : String(error),
    })
    if (isPersistenceUnavailable(error)) return NextResponse.json({ error: '账号服务数据库尚未配置或迁移未完成。' }, { status: 503 })
    return NextResponse.json({ error: '读取云端数据失败。' }, { status: 500 })
  }
}

export async function PUT(request: Request): Promise<NextResponse> {
  try {
    const userId = await sessionUserId(request)
    if (!userId) return NextResponse.json({ error: '未登录。' }, { status: 401 })
    const payload = await request.json() as { settings?: unknown }
    if (!payload.settings || typeof payload.settings !== 'object') return NextResponse.json({ error: '设置数据格式无效。' }, { status: 400 })
    const store = getPersistence()
    if (!store.saveUserSettings) return NextResponse.json({ error: '数据库尚未启用设置保存。' }, { status: 501 })
    const settings = { ...(payload.settings as Record<string, unknown>), apiKey: '' }
    await store.saveUserSettings(userId, settings)
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (isPersistenceUnavailable(error)) return NextResponse.json({ error: '账号服务数据库尚未配置或迁移未完成。' }, { status: 503 })
    // Keep the public response safe while allowing the client to distinguish
    // an invalid payload from a server-side write failure.
    const code = error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: unknown }).code || '')
      : ''
    const status = code === '22P02' || code === '22023' ? 400 : 500
    return NextResponse.json({ error: status === 400 ? '设置数据格式无效。' : '云端设置暂时无法保存，请稍后重试。' }, { status })
  }
}
