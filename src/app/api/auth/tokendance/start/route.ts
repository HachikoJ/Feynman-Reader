import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { error: '登录功能正在完善，近期即将开放。' },
    { status: 503, headers: { 'Cache-Control': 'no-store' } }
  )
}
