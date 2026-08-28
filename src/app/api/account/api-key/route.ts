import { NextResponse } from 'next/server'
import { encryptApiKey } from '@/lib/server/apiKeyVault'
import { getPersistence } from '@/lib/server/persistence'
import { sessionCookieName } from '@/lib/server/auth'

export const runtime = 'nodejs'

async function getUserId(request: Request): Promise<string | null> {
  const cookieHeader = request.headers.get('cookie') || ''
  const cookie = cookieHeader.split(';').map(part => part.trim()).find(part => part.startsWith(`${sessionCookieName()}=`))
  const sessionId = cookie?.slice(sessionCookieName().length + 1)
  if (!sessionId) return null
  const session = await getPersistence().findSession(sessionId)
  if (!session || Date.parse(session.expiresAt) <= Date.now()) return null
  return session.userId
}

export async function GET(request: Request): Promise<NextResponse> {
  let userId: string | null
  try {
    userId = await getUserId(request)
  } catch (error) {
    if (error instanceof Error && error.message === 'Persistence adapter is not configured.') {
      return NextResponse.json({ error: '账号服务尚未配置数据库。' }, { status: 503 })
    }
    return NextResponse.json({ error: '会话校验失败。' }, { status: 401 })
  }
  if (!userId) return NextResponse.json({ error: '未登录。' }, { status: 401 })
  try {
    const record = await getPersistence().getApiKey(userId, 'tokendance')
    return NextResponse.json({ configured: Boolean(record), masked: record ? '已配置（不会显示完整密钥）' : '' }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Persistence adapter is not configured.') {
      return NextResponse.json({ error: '账号服务尚未配置数据库。' }, { status: 503 })
    }
    return NextResponse.json({ error: '读取密钥状态失败。' }, { status: 500 })
  }
}

export async function PUT(request: Request): Promise<NextResponse> {
  let userId: string | null
  try {
    userId = await getUserId(request)
  } catch (error) {
    if (error instanceof Error && error.message === 'Persistence adapter is not configured.') {
      return NextResponse.json({ error: '账号服务尚未配置数据库。' }, { status: 503 })
    }
    return NextResponse.json({ error: '会话校验失败。' }, { status: 401 })
  }
  if (!userId) return NextResponse.json({ error: '未登录。' }, { status: 401 })
  let body: { apiKey?: unknown }
  try {
    body = await request.json() as { apiKey?: unknown }
  } catch {
    return NextResponse.json({ error: '请求体必须是 JSON。' }, { status: 400 })
  }
  if (typeof body.apiKey !== 'string') return NextResponse.json({ error: '缺少 API Key。' }, { status: 400 })
  try {
    const secret = encryptApiKey(body.apiKey)
    await getPersistence().saveApiKey({ userId, provider: 'tokendance', secret, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    // Deliberately do not return any portion of the secret to the browser.
    return NextResponse.json({ configured: true }, { status: 201 })
  } catch (error) {
    if (error instanceof Error && error.message === 'Persistence adapter is not configured.') {
      return NextResponse.json({ error: '账号服务尚未配置数据库。' }, { status: 503 })
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : '保存密钥失败。' }, { status: 400 })
  }
}

export async function DELETE(request: Request): Promise<NextResponse> {
  let userId: string | null
  try {
    userId = await getUserId(request)
  } catch (error) {
    if (error instanceof Error && error.message === 'Persistence adapter is not configured.') {
      return NextResponse.json({ error: '账号服务尚未配置数据库。' }, { status: 503 })
    }
    return NextResponse.json({ error: '会话校验失败。' }, { status: 401 })
  }
  if (!userId) return NextResponse.json({ error: '未登录。' }, { status: 401 })
  try {
    await getPersistence().deleteApiKey(userId, 'tokendance')
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    if (error instanceof Error && error.message === 'Persistence adapter is not configured.') {
      return NextResponse.json({ error: '账号服务尚未配置数据库。' }, { status: 503 })
    }
    return NextResponse.json({ error: '删除密钥失败。' }, { status: 500 })
  }
}
