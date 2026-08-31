import { indexedDB, initDB } from './db'
import { createLocalId } from './localId'
import { isLocalAuthBypassEnabled } from './accountClient'

export type AssistantMemoryCategory = 'preference' | 'learning-style' | 'goal' | 'workflow'

export interface AssistantMemory {
  id: string
  content: string
  category: AssistantMemoryCategory
  sourceSessionId?: string
  createdAt: number
  updatedAt: number
}

export const ASSISTANT_MEMORY_METADATA_KEY = 'assistant-memory'
const MEMORY_KEY = ASSISTANT_MEMORY_METADATA_KEY
const MAX_MEMORIES = 100
const MAX_MEMORY_CHARS = 500
let memoryWriteQueue: Promise<void> = Promise.resolve()
type AccountMode = 'authenticated' | 'anonymous'

function enqueueMemoryWrite(task: () => Promise<void>): Promise<void> {
  memoryWriteQueue = memoryWriteQueue.then(task, task)
  return memoryWriteQueue
}

/**
 * The browser database is intentionally only a legacy source. Once an account
 * is authenticated all reads and writes go through the account API.
 */
async function accountMode(): Promise<AccountMode> {
  if (process.env.NODE_ENV === 'test' || typeof window === 'undefined' || isLocalAuthBypassEnabled()) return 'anonymous'
  let response: Response
  try {
    response = await fetch('/api/auth/me/', { credentials: 'include', cache: 'no-store' })
  } catch {
    throw new Error('ASSISTANT_MEMORY_ACCOUNT_LOOKUP_FAILED')
  }
  if (response.status === 401) return 'anonymous'
  if (response.status === 503) throw new Error('ASSISTANT_MEMORY_DATABASE_UNAVAILABLE')
  if (!response.ok) throw new Error('ASSISTANT_MEMORY_ACCOUNT_LOOKUP_FAILED')
  const payload = await response.json().catch(() => null) as { user?: { id?: unknown } } | null
  return typeof payload?.user?.id === 'string' && payload.user.id ? 'authenticated' : 'anonymous'
}

function apiError(response: Response, fallback: string): Promise<Error> {
  return response.json().catch(() => null).then(payload => new Error(
    typeof payload?.error === 'string' && payload.error ? payload.error : fallback
  ))
}

function clone<T>(value: T): T {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)) as T
}

function normalize(value: unknown): AssistantMemory | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Partial<AssistantMemory>
  if (typeof item.id !== 'string' || typeof item.content !== 'string') return null
  if (!['preference', 'learning-style', 'goal', 'workflow'].includes(item.category || '')) return null
  const content = item.content.trim().slice(0, MAX_MEMORY_CHARS)
  if (!content) return null
  const createdAt = typeof item.createdAt === 'number' ? item.createdAt : Date.now()
  return {
    id: item.id,
    content,
    category: item.category as AssistantMemoryCategory,
    ...(typeof item.sourceSessionId === 'string' ? { sourceSessionId: item.sourceSessionId } : {}),
    createdAt,
    updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : createdAt
  }
}

async function readLocalMemories(key = MEMORY_KEY): Promise<AssistantMemory[]> {
  await initDB()
  const record = await indexedDB.get<{ key: string; memories?: unknown }>('metadata', key)
  if (!record || !Array.isArray(record.memories)) return []
  return record.memories.map(normalize).filter((item): item is AssistantMemory => item !== null)
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

function normalizeCloud(value: unknown): AssistantMemory | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Record<string, unknown>
  const createdAt = typeof item.createdAt === 'number'
    ? item.createdAt
    : typeof item.createdAt === 'string' ? Date.parse(item.createdAt) : NaN
  const updatedAt = typeof item.updatedAt === 'number'
    ? item.updatedAt
    : typeof item.updatedAt === 'string' ? Date.parse(item.updatedAt) : NaN
  return normalize({
    ...item,
    id: typeof item.id === 'string' ? item.id : item.memoryId,
    sourceSessionId: item.sourceSessionId ?? undefined,
    createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : (Number.isFinite(createdAt) ? createdAt : Date.now())
  })
}

async function writeLocal(memories: AssistantMemory[], key = MEMORY_KEY): Promise<void> {
  await initDB()
  await indexedDB.put('metadata', { key, memories: memories.slice(0, MAX_MEMORIES).map(clone) })
}

async function deleteLocalMemories(key = MEMORY_KEY): Promise<void> {
  await initDB()
  await indexedDB.delete('metadata', key)
}

async function fetchCloudMemories(): Promise<AssistantMemory[]> {
  const response = await fetch('/api/account/assistant-memories/', { credentials: 'include', cache: 'no-store' })
  if (!response.ok) throw await apiError(response, '读取费曼小助手长期记忆失败。')
  const payload = await response.json().catch(() => null) as { memories?: unknown } | null
  return (Array.isArray(payload?.memories) ? payload.memories : [])
    .map(normalizeCloud).filter((item): item is AssistantMemory => item !== null)
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

async function saveCloudMemory(memory: AssistantMemory): Promise<void> {
  const response = await fetch('/api/account/assistant-memories/', {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      memoryId: memory.id,
      content: memory.content,
      category: memory.category,
      sourceSessionId: memory.sourceSessionId ?? null,
      createdAt: memory.createdAt,
      updatedAt: memory.updatedAt,
    })
  })
  if (!response.ok) throw await apiError(response, '保存费曼小助手长期记忆失败。')
}

async function migrateLegacyMemories(cloudMemories: AssistantMemory[]): Promise<AssistantMemory[]> {
  const legacy = await readLocalMemories()
  if (!legacy.length) return cloudMemories

  const merged = [...cloudMemories]
  for (const memory of legacy) {
    const duplicate = merged.find(item => item.content.toLocaleLowerCase() === memory.content.toLocaleLowerCase())
    if (duplicate) continue
    await saveCloudMemory(memory)
    merged.push(memory)
  }
  // Only remove the IndexedDB record after every cloud write succeeded.
  await deleteLocalMemories()
  return merged.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_MEMORIES)
}

async function readCloudMemories(): Promise<AssistantMemory[]> {
  const memories = await fetchCloudMemories()
  return memories.length ? memories : migrateLegacyMemories(memories)
}

export async function getAssistantMemories(): Promise<AssistantMemory[]> {
  const mode = await accountMode()
  if (mode === 'anonymous') return readLocalMemories()
  return readCloudMemories()
}

export async function addAssistantMemory(input: Omit<AssistantMemory, 'id' | 'createdAt' | 'updatedAt'>): Promise<AssistantMemory> {
  const content = input.content.trim().slice(0, MAX_MEMORY_CHARS)
  if (!content) throw new Error('ASSISTANT_MEMORY_EMPTY')
  const now = Date.now()
  const memory: AssistantMemory = { ...input, id: createLocalId(), content, createdAt: now, updatedAt: now }
  let existingMemory: AssistantMemory | undefined
  const mode = await accountMode()
  await enqueueMemoryWrite(async () => {
    const memories = mode === 'authenticated' ? await readCloudMemories() : await readLocalMemories()
    existingMemory = memories.find(item => item.content.toLocaleLowerCase() === content.toLocaleLowerCase())
    if (existingMemory) return
    if (mode === 'authenticated') await saveCloudMemory(memory)
    else await writeLocal([memory, ...memories])
  })
  if (existingMemory) return existingMemory
  if (mode === 'authenticated') return memory
  const persisted = await readLocalMemories()
  const confirmed = persisted.find(item => item.id === memory.id)
  if (!confirmed) throw new Error('ASSISTANT_MEMORY_PERSIST_FAILED')
  return confirmed
}

export async function deleteAssistantMemory(id: string): Promise<void> {
  const mode = await accountMode()
  await enqueueMemoryWrite(async () => {
    if (mode === 'authenticated') {
      const response = await fetch(`/api/account/assistant-memories/?memoryId=${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include' })
      if (!response.ok) throw await apiError(response, '删除费曼小助手长期记忆失败。')
      return
    }
    await writeLocal((await readLocalMemories()).filter(item => item.id !== id))
  })
}

export async function clearAssistantMemories(): Promise<void> {
  const mode = await accountMode()
  await enqueueMemoryWrite(async () => {
    if (mode === 'authenticated') {
      const response = await fetch('/api/account/assistant-memories/', { method: 'DELETE', credentials: 'include' })
      if (!response.ok) throw await apiError(response, '清空费曼小助手长期记忆失败。')
      return
    }
    await writeLocal([])
  })
}

export function formatAssistantMemories(memories: AssistantMemory[], maxChars = 4000): string {
  return memories.map(memory => `- ${memory.content}`).join('\n').slice(0, Math.max(0, maxChars))
}

const EXPLICIT_MEMORY_PATTERNS = [
  /(?:^|[，,。！？!？\s])(?:请|帮我|你)?(?:记住|记下来|记一下|保存(?:一下)?|长期记忆|以后(?:请)?按这个|记得我)(?:[：:，,\s]*(?:一下|这个|这点)?[：:，,\s]*)(.+)$/iu,
  /(?:以后|今后|接下来)(?:请|都|要)?(?:记住|记得|按照|根据)(?:[：:，,\s]+)(.+)$/iu,
  /(?:把|将)(.+?)(?:记住|记下来|保存为长期记忆|作为长期记忆)(?:[。！？!?，,]|$)/iu
]
const UNSAFE_MEMORY_PATTERN = /(api\s*key|access[\s_-]*key|token\s*[:=]|password|credential|密码|密钥|私钥|secret|system prompt|系统提示词|忽略(?:之前|上面)的指令|越权|绕过安全)/iu

/** Returns a memory only when the user explicitly asks to remember a non-sensitive preference. */
export function extractExplicitAssistantMemory(message: string): Omit<AssistantMemory, 'id' | 'createdAt' | 'updatedAt'> | null {
  const match = EXPLICIT_MEMORY_PATTERNS.map(pattern => message.trim().match(pattern)).find(Boolean)
  if (!match) return null
  const content = match[1].replace(/^(?:是|为|我叫|我的名字是)\s*/iu, '').replace(/[。！？!?]+$/, '').trim()
  if (!content || content.length > MAX_MEMORY_CHARS || UNSAFE_MEMORY_PATTERN.test(content)) return null
  const category: AssistantMemoryCategory = /(复习|学习|费曼|笔记|实践)/u.test(content)
    ? 'learning-style'
    : /(目标|计划|想要|希望)/u.test(content) ? 'goal' : /(流程|工作流|习惯)/u.test(content) ? 'workflow' : 'preference'
  return { content, category }
}

export { MAX_MEMORIES, MAX_MEMORY_CHARS }
