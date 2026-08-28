import { NextResponse } from 'next/server'
import { getAuthConfig } from '@/lib/server/authConfig'

export const runtime = 'nodejs'

export function GET(): NextResponse {
  return NextResponse.json(getAuthConfig(), {
    headers: { 'Cache-Control': 'no-store' },
  })
}
