import { NextResponse } from 'next/server'
import { sessionUserId } from '@/lib/server/sessionUser'
import { getPersistence } from '@/lib/server/persistence'

export const runtime = 'nodejs'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function parseDate(value: string): number | null {
  if (!DATE_RE.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null
  return parsed.getTime()
}

function defaultBounds(): { from: string; to: string } {
  const now = new Date()
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0))
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) }
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const userId = await sessionUserId(request)
    if (!userId) return NextResponse.json({ error: '未登录。' }, { status: 401 })
    const params = new URL(request.url).searchParams
    const defaults = defaultBounds()
    const from = params.get('from') || defaults.from
    const to = params.get('to') || defaults.to
    const fromTime = parseDate(from)
    const toTime = parseDate(to)
    if (fromTime === null || toTime === null) {
      return NextResponse.json({ error: '日期范围格式无效。' }, { status: 400 })
    }
    if (toTime < fromTime) {
      return NextResponse.json({ error: '日期范围无效。' }, { status: 400 })
    }
    if (toTime - fromTime > 400 * 86400000) {
      return NextResponse.json({ error: '单次最多查询 401 天。' }, { status: 400 })
    }
    const store = getPersistence()
    if (!store.getActivityCalendar) return NextResponse.json({ error: '数据库尚未启用活动日历。' }, { status: 501 })
    const days = await store.getActivityCalendar(userId, from, to)
    return NextResponse.json({ days }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof Error && error.message === 'Persistence adapter is not configured.') {
      return NextResponse.json({ error: '账号服务尚未配置数据库。' }, { status: 503 })
    }
    return NextResponse.json({ error: '读取活动日历失败。' }, { status: 500 })
  }
}
