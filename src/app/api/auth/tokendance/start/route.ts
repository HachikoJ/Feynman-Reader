import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { error: '观猹登录即将上线，敬请期待～' },
    { status: 503, headers: { 'Cache-Control': 'no-store' } }
  )
}
