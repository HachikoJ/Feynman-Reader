export interface AccountUser {
  id: string
  tokendanceSubject?: string
  phone?: string
  email?: string
  phoneVerifiedAt?: string
  emailVerifiedAt?: string
}

export interface AccountState {
  user: AccountUser | null
  configured: boolean
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

// Keep this helper for callers that still import it while login is being completed.
export function isAccountRequired(): boolean {
  return false
}

export async function getAccount(): Promise<AccountState> {
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
}

export async function logout(): Promise<void> {
  const response = await fetch('/api/auth/logout/', { method: 'POST', credentials: 'include' })
  if (!response.ok && response.status !== 204) throw new Error('退出登录失败。')
}

export async function getApiKeyStatus(): Promise<{ configured: boolean; masked: string }> {
  const response = await fetch('/api/account/api-key/', { credentials: 'include', cache: 'no-store' })
  if (!response.ok) throw new Error((await response.json().catch(() => null) as { error?: string } | null)?.error || '无法读取 API Key 状态。')
  return response.json() as Promise<{ configured: boolean; masked: string }>
}

export async function saveApiKey(apiKey: string): Promise<void> {
  const response = await fetch('/api/account/api-key/', {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey }),
  })
  if (!response.ok) throw new Error((await response.json().catch(() => null) as { error?: string } | null)?.error || 'API Key 保存失败。')
}

export async function deleteApiKey(): Promise<void> {
  const response = await fetch('/api/account/api-key/', { method: 'DELETE', credentials: 'include' })
  if (!response.ok) throw new Error((await response.json().catch(() => null) as { error?: string } | null)?.error || 'API Key 删除失败。')
}

export async function importLocalData(payload: unknown): Promise<{ booksImported: number; aiUsageImported: number; listsImported: number; relationsImported: number }> {
  const response = await fetch('/api/account/import/', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  const data = await response.json().catch(() => ({})) as { error?: string; booksImported?: number; aiUsageImported?: number; listsImported?: number; relationsImported?: number }
  if (!response.ok) throw new Error(data.error || '本地数据导入失败。')
  return {
    booksImported: data.booksImported || 0,
    aiUsageImported: data.aiUsageImported || 0,
    listsImported: data.listsImported || 0,
    relationsImported: data.relationsImported || 0,
  }
}

export async function getUserDataSummary(): Promise<UserDataSummary> {
  const response = await fetch('/api/account/data/', { credentials: 'include', cache: 'no-store' })
  const data = await response.json().catch(() => ({})) as { error?: string }
  if (!response.ok) throw new Error(data.error || '无法读取云端数据。')
  return data as UserDataSummary
}

export async function getCloudData(): Promise<unknown> {
  const response = await fetch('/api/account/data/?format=full', { credentials: 'include', cache: 'no-store' })
  const data = await response.json().catch(() => ({})) as { error?: string }
  if (!response.ok) throw new Error(data.error || '无法读取云端学习数据。')
  return data
}

export async function getMigrationState(activateWindow = false): Promise<MigrationState> {
  const query = activateWindow ? '?activate=1' : ''
  const response = await fetch(`/api/account/migration/${query}`, { credentials: 'include', cache: 'no-store' })
  const data = await response.json().catch(() => ({})) as { error?: string }
  if (!response.ok) throw new Error(data.error || '无法读取历史数据迁移状态。')
  return data as MigrationState
}

export async function migrateLocalData(payload: unknown): Promise<MigrationState & { booksImported: number; aiUsageImported: number; listsImported: number; relationsImported: number }> {
  const response = await fetch('/api/account/migration/', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  const data = await response.json().catch(() => ({})) as { error?: string }
  if (!response.ok) throw new Error(data.error || '历史数据迁移失败。')
  return data as MigrationState & { booksImported: number; aiUsageImported: number; listsImported: number; relationsImported: number }
}
