import { NextResponse } from 'next/server'
import { requireAdminIdentity } from '@/lib/server/adminAuth'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const result = await requireAdminIdentity(request)
    return new NextResponse(null, { status: result.ok ? 204 : result.status, headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return new NextResponse(null, { status: 403, headers: { 'Cache-Control': 'no-store' } })
  }
}
