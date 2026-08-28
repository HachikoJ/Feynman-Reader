import { NextResponse } from 'next/server'
import { sessionCookieName } from '@/lib/server/auth'
import { getPersistence } from '@/lib/server/persistence'

export const runtime = 'nodejs'

export async function POST(request: Request): Promise<NextResponse> {
  const cookieHeader = request.headers.get('cookie') || ''
  const part = cookieHeader.split(';').map(value => value.trim()).find(value => value.startsWith(`${sessionCookieName()}=`))
  const response = new NextResponse(null, { status: 204 })
  response.headers.append('Set-Cookie', `${sessionCookieName()}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`)
  if (!part) return response

  try {
    await getPersistence().deleteSession(decodeURIComponent(part.slice(sessionCookieName().length + 1)))
  } catch {
    // Clearing the browser cookie still logs the user out locally if the database is unavailable.
  }
  return response
}
