import OpenAI from 'openai'
import { NextResponse } from 'next/server'
import { decryptApiKey } from '@/lib/server/apiKeyVault'
import { getPersistence } from '@/lib/server/persistence'
import { sessionUserId } from '@/lib/server/sessionUser'
import { TOKENDANCE_APP_URL, TOKENDANCE_GATEWAY_URL } from '@/lib/tokendance'

export const runtime = 'nodejs'

export async function POST(request: Request): Promise<NextResponse> {
  if (Number(request.headers.get('content-length') || 0) > 4 * 1024 * 1024) {
    return NextResponse.json({ error: { message: '请求内容超过 4 MB 限制。' } }, { status: 413 })
  }
  try {
    const userId = await sessionUserId(request)
    if (!userId) return NextResponse.json({ error: { message: '未登录。' } }, { status: 401 })
    const store = getPersistence()
    const record = await store.getApiKey(userId, 'tokendance')
    if (!record) return NextResponse.json({ error: { message: '请先在设置中配置 TokenDance API Key，并确认 AI 数据传输同意。' } }, { status: 403 })
    const payload = await request.json() as Record<string, unknown>
    if (payload.stream === true) return NextResponse.json({ error: { message: '暂不支持流式请求。' } }, { status: 400 })
    const secret = decryptApiKey(record.secret)
    const client = new OpenAI({ baseURL: TOKENDANCE_GATEWAY_URL, apiKey: secret, defaultHeaders: { 'X-App-URL': TOKENDANCE_APP_URL }, maxRetries: 0 })
    const completion = await client.chat.completions.create(payload as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming)
    return NextResponse.json(completion)
  } catch (error) {
    const status = typeof error === 'object' && error && 'status' in error && Number.isInteger((error as { status?: unknown }).status)
      ? Number((error as { status: number }).status)
      : 500
    const message = error instanceof Error ? error.message : 'AI 请求失败。'
    return NextResponse.json({ error: { message } }, { status: status >= 400 && status < 600 ? status : 500 })
  }
}
