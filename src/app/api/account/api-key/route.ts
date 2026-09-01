import { NextResponse } from 'next/server'
import { encryptApiKey } from '@/lib/server/apiKeyVault'
import { getPersistence } from '@/lib/server/persistence'
import { sessionCookieName } from '@/lib/server/auth'
import { isDeepSeekOfficialEnabled, isTokenDanceEnabled } from '@/lib/aiProviderPolicy'
import type { ApiKeyRecord } from '@/lib/server/persistence'

export const runtime = 'nodejs'

type Provider = ApiKeyRecord['provider']

function providerFromRequest(request: Request, body?: { provider?: unknown }): Provider | null {
  const value = body?.provider ?? new URL(request.url).searchParams.get('provider')
  return value === 'deepseek' || value === 'tokendance' ? value : null
}

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
    const provider = providerFromRequest(request) || 'tokendance'
    const store = getPersistence()
    const [record, deepseekRecord] = await Promise.all([
      store.getApiKey(userId, provider),
      provider === 'tokendance' ? store.getApiKey(userId, 'deepseek') : Promise.resolve(null),
    ])
    return NextResponse.json({
      configured: Boolean(record),
      masked: record ? '已配置（不会显示完整密钥）' : '',
      providers: provider === 'tokendance' ? { tokendance: Boolean(record), deepseek: Boolean(deepseekRecord) } : undefined,
    }, {
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
  let body: { apiKey?: unknown; provider?: unknown }
  try {
    body = await request.json() as { apiKey?: unknown }
  } catch {
    return NextResponse.json({ error: '请求体必须是 JSON。' }, { status: 400 })
  }
  if (typeof body.apiKey !== 'string') return NextResponse.json({ error: '缺少 API Key。' }, { status: 400 })
  const provider = providerFromRequest(request, body)
  if (!provider) return NextResponse.json({ error: 'AI 渠道无效。' }, { status: 400 })
  if (provider === 'tokendance' && !isTokenDanceEnabled()) return NextResponse.json({ error: 'TokenDance 配置将在备案完成后恢复。' }, { status: 503 })
  if (provider === 'deepseek' && !isDeepSeekOfficialEnabled()) return NextResponse.json({ error: 'DeepSeek 官方配置渠道当前不可用。' }, { status: 503 })
  try {
    const secret = encryptApiKey(body.apiKey)
    await getPersistence().saveApiKey({ userId, provider, secret, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
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
  const provider = providerFromRequest(request) || 'tokendance'
  try {
    await getPersistence().deleteApiKey(userId, provider)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    if (error instanceof Error && error.message === 'Persistence adapter is not configured.') {
      return NextResponse.json({ error: '账号服务尚未配置数据库。' }, { status: 503 })
    }
    return NextResponse.json({ error: '删除密钥失败。' }, { status: 500 })
  }
}
