import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

/** Retained only to give old clients an explicit, non-actionable response. */
export function POST(): NextResponse {
  return NextResponse.json({ error: '该账号绑定入口已停用。' }, { status: 410 })
}
