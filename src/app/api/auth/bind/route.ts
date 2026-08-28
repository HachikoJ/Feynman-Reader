import { NextResponse } from 'next/server'
import { validateBinding, type AuthProvider } from '@/lib/server/auth'
import { getPersistence } from '@/lib/server/persistence'

export const runtime = 'nodejs'

interface BindBody {
  provider?: AuthProvider
  phone?: string
  email?: string
  tokendanceSubject?: string
}

function isProvider(value: unknown): value is AuthProvider {
  return value === 'tokendance' || value === 'phone' || value === 'email'
}

/** Bind an identity after its provider has completed verification. */
export async function POST(request: Request): Promise<NextResponse> {
  let body: BindBody
  try {
    body = await request.json() as BindBody
  } catch {
    return NextResponse.json({ error: '请求体必须是 JSON。' }, { status: 400 })
  }
  if (!isProvider(body.provider)) {
    return NextResponse.json({ error: '不支持的登录方式。' }, { status: 400 })
  }
  try {
    const binding = validateBinding({
      provider: body.provider,
      phone: body.phone,
      email: body.email,
    })
    const subject = body.provider === 'tokendance' ? body.tokendanceSubject?.trim() : undefined
    if (body.provider === 'tokendance' && (!subject || subject.length > 255)) {
      return NextResponse.json({ error: '观猹登录缺少有效的用户标识。' }, { status: 400 })
    }
    const store = getPersistence()
    const existing = subject
      ? await store.findByTokendanceSubject(subject)
      : binding.phone
        ? await store.findByPhone(binding.phone)
        : binding.email
          ? await store.findByEmail(binding.email)
          : null
    const user = existing
      ? await store.updateUser(existing.id, { ...binding, ...(subject ? { tokendanceSubject: subject } : {}) })
      : await store.createUser({ ...binding, ...(subject ? { tokendanceSubject: subject } : {}) })
    return NextResponse.json({ user: { ...user, id: user.id } }, { status: existing ? 200 : 201 })
  } catch (error) {
    if (error instanceof Error && error.message === 'Persistence adapter is not configured.') {
      return NextResponse.json({ error: '账号服务尚未配置数据库。' }, { status: 503 })
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : '账号绑定失败。' }, { status: 400 })
  }
}
