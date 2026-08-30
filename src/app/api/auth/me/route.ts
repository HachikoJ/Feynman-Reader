import { NextResponse } from 'next/server'
import { sessionCookieName } from '@/lib/server/auth'
import { getPersistence, isPersistenceUnavailable } from '@/lib/server/persistence'

export const runtime = 'nodejs'

/**
 * Session endpoint placeholder. A production deployment must resolve the
 * HttpOnly feynman_session cookie through the configured persistence adapter.
 * Returning 401 when no adapter/session exists is intentional: the client
 * must never infer authentication from local storage or a caller-supplied ID.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const raw = request.headers.get('cookie') || ''
    const part = raw.split(';').map(value => value.trim()).find(value => value.startsWith(`${sessionCookieName()}=`))
    if (!part) return NextResponse.json({ user: null }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
    const sessionId = decodeURIComponent(part.slice(sessionCookieName().length + 1))
    const store = getPersistence()
    const session = await store.findSession(sessionId)
    if (!session || Date.parse(session.expiresAt) <= Date.now()) return NextResponse.json({ user: null }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
    const user = await store.findUserById(session.userId)
    const profile = store.getUserProfile ? await store.getUserProfile(session.userId) : null
    return NextResponse.json({ user: user ? { ...user, ...(profile ? { displayName: profile.displayName, avatarUrl: profile.avatarUrl } : {}) } : { id: session.userId } }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (isPersistenceUnavailable(error)) return NextResponse.json({ user: null, error: '账号服务尚未配置数据库。' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
    return NextResponse.json({ user: null }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
  }
}
