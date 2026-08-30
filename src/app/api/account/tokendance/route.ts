import { NextResponse } from 'next/server'
import { decryptApiKey } from '@/lib/server/apiKeyVault'
import { getPersistence } from '@/lib/server/persistence'
import { sessionUserId } from '@/lib/server/sessionUser'
import { createTokendancePaymentSession, fetchTokendanceBalance, getTokendancePaymentSession } from '@/lib/tokendance'

export const runtime = 'nodejs'

async function accountApiKey(request: Request): Promise<string | null> {
  const userId = await sessionUserId(request)
  if (!userId) return null
  const record = await getPersistence().getApiKey(userId, 'tokendance')
  return record ? decryptApiKey(record.secret) : ''
}

function failure(error: unknown): NextResponse {
  const message = error instanceof Error ? error.message : 'TokenDance 请求失败。'
  const statusMatch = message.match(/\((\d{3})\)/)
  const upstreamStatus = statusMatch ? Number(statusMatch[1]) : 0
  const status = upstreamStatus === 401 || upstreamStatus === 403 ? 401 : 502
  const publicMessage = status === 401
    ? 'TokenDance API Key 已失效，请重新授权或填写有效 Key。'
    : 'TokenDance 服务暂时不可用，请稍后重试。'
  return NextResponse.json({ error: publicMessage }, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const secret = await accountApiKey(request)
    if (secret === null) return NextResponse.json({ error: '未登录。' }, { status: 401 })
    if (!secret) return NextResponse.json({ error: '尚未配置 TokenDance API Key。' }, { status: 403 })
    return NextResponse.json(await fetchTokendanceBalance(secret), { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return failure(error)
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const secret = await accountApiKey(request)
    if (secret === null) return NextResponse.json({ error: '未登录。' }, { status: 401 })
    if (!secret) return NextResponse.json({ error: '尚未配置 TokenDance API Key。' }, { status: 403 })
    const payload = await request.json() as { amount?: unknown }
    const amount = Number(payload.amount)
    if (!Number.isInteger(amount) || amount < 1 || amount > 100000) {
      return NextResponse.json({ error: '充值金额须为 1 至 100000 元的整数。' }, { status: 400 })
    }
    return NextResponse.json(await createTokendancePaymentSession(secret, amount), { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return failure(error)
  }
}

export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    const secret = await accountApiKey(request)
    if (secret === null) return NextResponse.json({ error: '未登录。' }, { status: 401 })
    if (!secret) return NextResponse.json({ error: '尚未配置 TokenDance API Key。' }, { status: 403 })
    const payload = await request.json() as { statusUrl?: unknown }
    if (typeof payload.statusUrl !== 'string') return NextResponse.json({ error: '充值状态地址无效。' }, { status: 400 })
    return NextResponse.json(await getTokendancePaymentSession(secret, payload.statusUrl), { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return failure(error)
  }
}
