import { sessionCookieName } from './auth'
import { getPersistence } from './persistence'

export async function sessionUserId(request: Request): Promise<string | null> {
  const cookie = (request.headers.get('cookie') || '')
    .split(';')
    .map(value => value.trim())
    .find(value => value.startsWith(`${sessionCookieName()}=`))
  if (!cookie) return null
  const sessionId = decodeURIComponent(cookie.slice(sessionCookieName().length + 1))
  const session = await getPersistence().findSession(sessionId)
  return session && Date.parse(session.expiresAt) > Date.now() ? session.userId : null
}
