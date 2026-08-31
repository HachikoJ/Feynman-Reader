import OpenAI from 'openai'
import { NextResponse } from 'next/server'
import { decryptApiKey } from '@/lib/server/apiKeyVault'
import { getPersistence } from '@/lib/server/persistence'
import { sessionUserId } from '@/lib/server/sessionUser'
import { TOKENDANCE_APP_URL, TOKENDANCE_GATEWAY_URL } from '@/lib/tokendance'

export const runtime = 'nodejs'

function isStructuredOutputUnsupported(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const candidate = error as Record<string, unknown>
  if (candidate.status !== 400) return false
  const details = [
    candidate.message,
    candidate.code,
    candidate.type,
    candidate.error && typeof candidate.error === 'object'
      ? (candidate.error as Record<string, unknown>).message
      : undefined,
    candidate.error && typeof candidate.error === 'object'
      ? (candidate.error as Record<string, unknown>).code
      : undefined,
    candidate.error && typeof candidate.error === 'object'
      ? (candidate.error as Record<string, unknown>).param
      : undefined
  ]
    .filter(value => typeof value === 'string')
    .join(' ')
    .toLowerCase()
  return details.includes('response_format')
    || details.includes('json_object')
    || details.includes('structured output')
    || details.includes('structured_output')
}

function getRecoveryAction(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null
  const headers = (error as { headers?: unknown }).headers
  if (!headers || typeof headers !== 'object') return null
  const value = 'get' in headers && typeof (headers as { get?: unknown }).get === 'function'
    ? (headers as { get(name: string): string | null }).get('TokenDance-Recovery-Action')
    : (headers as Record<string, unknown>)['TokenDance-Recovery-Action']
  return value === 'top_up_balance' || value === 'reauthorize_api_key' || value === 'api_key_quota' ? value : null
}

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
    let completion: OpenAI.Chat.Completions.ChatCompletion
    try {
      completion = await client.chat.completions.create(payload as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming)
    } catch (error) {
      // TokenDance accepts the JSON instruction in the prompt even when a
      // gateway deployment does not expose OpenAI's optional response_format.
      if (payload.response_format && isStructuredOutputUnsupported(error)) {
        const { response_format: _responseFormat, ...fallbackPayload } = payload
        completion = await client.chat.completions.create(
          fallbackPayload as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming
        )
      } else {
        throw error
      }
    }
    return NextResponse.json(completion)
  } catch (error) {
    const status = typeof error === 'object' && error && 'status' in error && Number.isInteger((error as { status?: unknown }).status)
      ? Number((error as { status: number }).status)
      : 500
    const message = error instanceof Error ? error.message : 'AI 请求失败。'
    const headers = new Headers({ 'Cache-Control': 'no-store' })
    const recoveryAction = getRecoveryAction(error)
    if (recoveryAction) headers.set('TokenDance-Recovery-Action', recoveryAction)
    return NextResponse.json({ error: { message } }, { status: status >= 400 && status < 600 ? status : 500, headers })
  }
}
