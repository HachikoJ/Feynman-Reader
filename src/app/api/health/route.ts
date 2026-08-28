import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { status: 'ok' },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
