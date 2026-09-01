export interface AccountUser {
  id: string
  username?: string
  hasPassword?: boolean
  tokendanceSubject?: string
  passwordAccountMergedAt?: string
  displayName?: string
  avatarUrl?: string
  phone?: string
  email?: string
  phoneVerifiedAt?: string
  emailVerifiedAt?: string
}

export interface AccountState {
  user: AccountUser | null
  configured: boolean
}

let accountRequest: Promise<AccountState> | null = null
let accountCache: { value: AccountState; expiresAt: number } | null = null
const ACCOUNT_CACHE_MS = 5_000
const ACCOUNT_DATA_CACHE_MS = 2_000
const accountDataCache = new Map<string, { value: unknown; expiresAt: number }>()
const accountDataRequests = new Map<string, Promise<unknown>>()

async function cachedAccountRead<T>(key: string, load: () => Promise<T>): Promise<T> {
  const cached = accountDataCache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.value as T
  const pending = accountDataRequests.get(key)
  if (pending) return pending as Promise<T>
  const request = load().then(value => {
    accountDataCache.set(key, { value, expiresAt: Date.now() + ACCOUNT_DATA_CACHE_MS })
    return value
  }).finally(() => accountDataRequests.delete(key))
  accountDataRequests.set(key, request)
  return request
}

export function invalidateAccountDataCache(): void {
  accountDataCache.clear()
}

export interface UserDataSummary {
  books: number
  notes: number
  practices: number
  qaRecords: number
  aiUsageRecords: number
  lists: number
  relations: number
  lastImportAt: string | null
  lastSyncAt: string | null
  quotes: number
  assistantSessions: number
  assistantMemories: number
  storageBytes: number
}

export interface UserBookSummary {
  id: string
  name: string
  author?: string
  status: string
  currentPhase: number
  bestScore: number
  createdAt: number
  updatedAt: number
  noteCount: number
  practiceCount: number
  questionsDone: number
  questionsTotal: number
  hasRecommendations: boolean
}

export interface MigrationState {
  status: 'pending' | 'running' | 'completed' | 'failed'
  version: number
  startedAt: string | null
  deadlineAt: string | null
  completedAt: string | null
  lastError: string | null
  syncVersion: number
}

export interface ActivityDay {
  date: string
  count: number
  categories: Record<string, number>
}

export interface RecycleBinItem {
  bookId: string
  name: string
  author: string | null
  deletedAt: string
  restoreUntil: string
}

export function isLocalAuthBypassEnabled(): boolean {
  // This flag is intentionally build-time configurable so a temporary
  // production deployment can run in local-only mode while OAuth callbacks
  // are unavailable (for example during domain备案). Remove it or set it to
  // false before the next build to restore account sign-in and cloud sync.
  // Watcha takes precedence so a stale temporary bypass cannot leave a second
  // login mode active after the OAuth-only transition is enabled.
  return !isWatchaOAuthEnabled() && process.env.NEXT_PUBLIC_FEYNMAN_LOCAL_AUTH_BYPASS === 'true'
}

export function isWatchaOAuthEnabled(): boolean {
  return process.env.NEXT_PUBLIC_FEYNMAN_WATCHA_OAUTH_ENABLED === 'true'
}

// Keep this helper as the single feature flag for callers that need to know
// whether account-backed data requires an authenticated session.
export function isAccountRequired(): boolean {
  return !isLocalAuthBypassEnabled()
}

export function accountLoginHref(returnTo = '/'): string {
  const safeReturnTo = returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/'
  return `/login?returnTo=${encodeURIComponent(safeReturnTo)}`
}

export function tokendanceLoginHref(returnTo = '/'): string {
  const safeReturnTo = returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/'
  return `/api/auth/tokendance/start/?returnTo=${encodeURIComponent(safeReturnTo)}`
}

export async function getAccount(): Promise<AccountState> {
  const now = Date.now()
  if (accountCache && accountCache.expiresAt > now) return accountCache.value
  if (accountRequest) return accountRequest

  accountRequest = (async () => {
    try {
      const response = await fetch('/api/auth/me/', { credentials: 'include', cache: 'no-store' })
      if (response.ok) {
        const data = await response.json() as { user?: AccountUser | null }
        return { user: data.user ?? null, configured: true }
      }
      return { user: null, configured: response.status !== 503 }
    } catch {
      // A transient browser/network failure must not turn the login page into a runtime error.
      return { user: null, configured: false }
    }
  })().then(value => {
    accountCache = { value, expiresAt: Date.now() + ACCOUNT_CACHE_MS }
    return value
  }).finally(() => { accountRequest = null })

  return accountRequest
}

export async function logout(): Promise<void> {
  const response = await fetch('/api/auth/logout/', { method: 'POST', credentials: 'include' })
  if (!response.ok && response.status !== 204) throw new Error('退出登录失败。')
  accountCache = null
  invalidateAccountDataCache()
}

export type AccountApiKeyProvider = 'tokendance' | 'deepseek'

export async function getApiKeyStatus(provider: AccountApiKeyProvider = 'tokendance'): Promise<{ configured: boolean; masked: string; providers?: Record<AccountApiKeyProvider, boolean> }> {
  const response = await fetch(`/api/account/api-key/?provider=${provider}`, { credentials: 'include', cache: 'no-store' })
  if (!response.ok) throw new Error((await response.json().catch(() => null) as { error?: string } | null)?.error || '无法读取 API Key 状态。')
  return response.json() as Promise<{ configured: boolean; masked: string }>
}

export async function saveApiKey(apiKey: string, provider: AccountApiKeyProvider = 'tokendance'): Promise<void> {
  const response = await fetch('/api/account/api-key/', {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey, provider }),
  })
  if (!response.ok) throw new Error((await response.json().catch(() => null) as { error?: string } | null)?.error || 'API Key 保存失败。')
}

export async function deleteApiKey(provider: AccountApiKeyProvider = 'tokendance'): Promise<void> {
  const response = await fetch(`/api/account/api-key/?provider=${provider}`, { method: 'DELETE', credentials: 'include' })
  if (!response.ok) throw new Error((await response.json().catch(() => null) as { error?: string } | null)?.error || 'API Key 删除失败。')
}

export async function importLocalData(payload: unknown): Promise<{ booksImported: number; aiUsageImported: number; listsImported: number; relationsImported: number; assistantSessionsImported: number; assistantMemoriesImported: number }> {
  const response = await fetch('/api/account/import/', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  const data = await response.json().catch(() => ({})) as { error?: string; booksImported?: number; aiUsageImported?: number; listsImported?: number; relationsImported?: number; assistantSessionsImported?: number; assistantMemoriesImported?: number }
  if (!response.ok) throw new Error(data.error || '本地数据导入失败。')
  invalidateAccountDataCache()
  return {
    booksImported: data.booksImported || 0,
    aiUsageImported: data.aiUsageImported || 0,
    listsImported: data.listsImported || 0,
    relationsImported: data.relationsImported || 0,
    assistantSessionsImported: data.assistantSessionsImported || 0,
    assistantMemoriesImported: data.assistantMemoriesImported || 0,
  }
}

export async function getUserDataSummary(): Promise<UserDataSummary> {
  return cachedAccountRead('summary', async () => {
    const response = await fetch('/api/account/data/', { credentials: 'include', cache: 'no-store' })
    const data = await response.json().catch(() => ({})) as { error?: string }
    if (!response.ok) throw new Error(data.error || '无法读取云端数据。')
    return data as UserDataSummary
  })
}

export async function getCloudData(format: 'full' | 'core' = 'full'): Promise<unknown> {
  const response = await fetch(`/api/account/data/?format=${format}`, { credentials: 'include', cache: 'no-store' })
  const data = await response.json().catch(() => ({})) as { error?: string }
  if (!response.ok) throw new Error(data.error || '无法读取云端学习数据。')
  return data
}

export async function getCloudBookSummaries(): Promise<UserBookSummary[]> {
  return cachedAccountRead('books', async () => {
    const response = await fetch('/api/account/books/', { credentials: 'include', cache: 'no-store' })
    const data = await response.json().catch(() => ({})) as { error?: string; books?: unknown }
    if (!response.ok) throw new Error(data.error || '无法读取云端书架。')
    return Array.isArray(data.books) ? data.books as UserBookSummary[] : []
  })
}

export async function getCloudSettings(): Promise<Record<string, unknown>> {
  return cachedAccountRead('settings', async () => {
    const response = await fetch('/api/account/data/?format=settings', { credentials: 'include', cache: 'no-store' })
    const data = await response.json().catch(() => ({})) as { error?: string; settings?: unknown }
    if (!response.ok) throw new Error(data.error || '无法读取云端设置。')
    return data.settings && typeof data.settings === 'object' && !Array.isArray(data.settings)
      ? data.settings as Record<string, unknown>
      : {}
  })
}

export async function getRecycleBin(): Promise<RecycleBinItem[]> {
  return cachedAccountRead('recycle-bin', async () => {
  const retryStatuses = new Set([408, 425, 429, 500, 502, 503, 504])
  let lastError: Error | null = null
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
    const timeout = controller ? setTimeout(() => controller.abort(), 8_000) : null
    let retryable = true
    try {
      const response = await fetch('/api/account/recycle-bin/', {
        credentials: 'include',
        cache: 'no-store',
        ...(controller ? { signal: controller.signal } : {})
      })
      const data = await response.json().catch(() => ({})) as { error?: string; items?: unknown }
      if (response.ok) return Array.isArray(data.items) ? data.items as RecycleBinItem[] : []
      lastError = new Error(data.error || `回收站读取失败（HTTP ${response.status}）。`)
      retryable = retryStatuses.has(response.status)
      if (!retryable || attempt === 2) throw lastError
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('回收站读取失败。')
      if (!retryable || attempt === 2) throw lastError
    } finally {
      if (timeout !== null) clearTimeout(timeout)
    }
    await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)))
  }
    throw lastError || new Error('回收站读取失败。')
  })
}

export async function getMigrationState(activateWindow = false): Promise<MigrationState> {
  const query = activateWindow ? '?activate=1' : ''
  const response = await fetch(`/api/account/migration/${query}`, { credentials: 'include', cache: 'no-store' })
  const data = await response.json().catch(() => ({})) as { error?: string }
  if (!response.ok) throw new Error(data.error || '无法读取历史数据迁移状态。')
  return data as MigrationState
}

export async function migrateLocalData(payload: unknown): Promise<MigrationState & { booksImported: number; aiUsageImported: number; listsImported: number; relationsImported: number; assistantSessionsImported: number; assistantMemoriesImported: number }> {
  const response = await fetch('/api/account/migration/', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  const data = await response.json().catch(() => ({})) as { error?: string }
  if (!response.ok) throw new Error(data.error || '历史数据迁移失败。')
  invalidateAccountDataCache()
  return data as MigrationState & { booksImported: number; aiUsageImported: number; listsImported: number; relationsImported: number; assistantSessionsImported: number; assistantMemoriesImported: number }
}

export async function mergePasswordAccount(username: string, password: string): Promise<void> {
  const response = await fetch('/api/account/merge-password-account/', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, confirm: true }),
  })
  const data = await response.json().catch(() => ({})) as { error?: string }
  if (!response.ok) throw new Error(data.error || '原账号迁移失败。')
}

export async function getActivityCalendar(from: string, to: string): Promise<ActivityDay[]> {
  return cachedAccountRead(`activity:${from}:${to}`, async () => {
    const response = await fetch(`/api/account/activity/?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { credentials: 'include', cache: 'no-store' })
    const data = await response.json().catch(() => ({})) as { error?: string; days?: ActivityDay[] }
    if (!response.ok) throw new Error(data.error || '无法读取活动日历。')
    return Array.isArray(data.days) ? data.days : []
  })
}
