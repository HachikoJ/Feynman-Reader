import { NextResponse } from 'next/server'
import { sessionCookieName } from '@/lib/server/auth'
import { getPersistence, isPersistenceUnavailable, type UserProfile } from '@/lib/server/persistence'

export const runtime = 'nodejs'

async function currentUserId(request: Request): Promise<string | null> {
  const part = (request.headers.get('cookie') || '').split(';').map(value => value.trim()).find(value => value.startsWith(`${sessionCookieName()}=`))
  if (!part) return null
  const session = await getPersistence().findSession(decodeURIComponent(part.slice(sessionCookieName().length + 1)))
  return session && Date.parse(session.expiresAt) > Date.now() ? session.userId : null
}

function cleanName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const name = value.trim()
  if (!name) return ''
  if (name.length > 40) throw new Error('账号名称不能超过 40 个字符。')
  return name
}

function cleanAvatar(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const avatar = value.trim()
  if (!avatar) return ''
  if (avatar.startsWith('data:image/')) {
    if (!/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/i.test(avatar) || avatar.length > 1_500_000) {
      throw new Error('头像图片格式或大小无效。')
    }
    return avatar
  }
  if (avatar.length > 2048) throw new Error('头像地址过长。')
  try {
    const parsed = new URL(avatar)
    if (parsed.protocol !== 'https:') throw new Error('头像地址必须使用 HTTPS。')
  } catch {
    throw new Error('请输入有效的头像地址。')
  }
  return avatar
}

export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    const userId = await currentUserId(request)
    if (!userId) return NextResponse.json({ error: '未登录。' }, { status: 401 })
    const body = await request.json() as { displayName?: unknown; avatarUrl?: unknown }
    const store = getPersistence()
    if (!store.getUserProfile || !store.saveUserProfile) return NextResponse.json({ error: '账号资料服务尚未启用。' }, { status: 501 })
    const current = await store.getUserProfile(userId)
    const profile: UserProfile = {
      ...current,
      ...(body.displayName !== undefined ? { customDisplayName: cleanName(body.displayName) || null } : {}),
      ...(body.avatarUrl !== undefined ? { customAvatarUrl: cleanAvatar(body.avatarUrl) || null } : {}),
    }
    if (body.displayName === undefined && body.avatarUrl === undefined) return NextResponse.json({ error: '没有需要更新的资料。' }, { status: 400 })
    const saved = await store.saveUserProfile(userId, profile)
    const user = await store.findUserById(userId)
    if (!user) return NextResponse.json({ error: '账号不存在。' }, { status: 404 })
    return NextResponse.json({ user, profile: saved }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (isPersistenceUnavailable(error)) return NextResponse.json({ error: '账号服务数据库尚未配置或迁移未完成。' }, { status: 503 })
    return NextResponse.json({ error: error instanceof Error ? error.message : '账号资料保存失败。' }, { status: 400 })
  }
}
