import { indexedDB, initDB } from './db'
import { createLocalId } from './localId'

export type AssistantMemoryCategory = 'preference' | 'learning-style' | 'goal' | 'workflow'

export interface AssistantMemory {
  id: string
  content: string
  category: AssistantMemoryCategory
  sourceSessionId?: string
  createdAt: number
  updatedAt: number
}

const MEMORY_KEY = 'assistant-memory'
const MAX_MEMORIES = 100
const MAX_MEMORY_CHARS = 500
let memoryWriteQueue: Promise<void> = Promise.resolve()

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

export async function getAssistantMemories(): Promise<AssistantMemory[]> {
  await initDB()
  const record = await indexedDB.get<{ key: string; memories?: unknown }>('metadata', MEMORY_KEY)
  if (!record || !Array.isArray(record.memories)) return []
  return record.memories.map(normalize).filter((item): item is AssistantMemory => item !== null)
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

async function write(memories: AssistantMemory[]): Promise<void> {
  await initDB()
  await indexedDB.put('metadata', { key: MEMORY_KEY, memories: memories.slice(0, MAX_MEMORIES).map(clone) })
}

export async function addAssistantMemory(input: Omit<AssistantMemory, 'id' | 'createdAt' | 'updatedAt'>): Promise<AssistantMemory> {
  const content = input.content.trim().slice(0, MAX_MEMORY_CHARS)
  if (!content) throw new Error('ASSISTANT_MEMORY_EMPTY')
  const now = Date.now()
  const memory: AssistantMemory = { ...input, id: createLocalId(), content, createdAt: now, updatedAt: now }
  let existingMemory: AssistantMemory | undefined
  memoryWriteQueue = memoryWriteQueue.then(async () => {
    const memories = await getAssistantMemories()
    existingMemory = memories.find(item => item.content.toLocaleLowerCase() === content.toLocaleLowerCase())
    if (!existingMemory) await write([memory, ...memories])
  }, async () => {
    const memories = await getAssistantMemories()
    existingMemory = memories.find(item => item.content.toLocaleLowerCase() === content.toLocaleLowerCase())
    if (!existingMemory) await write([memory, ...memories])
  })
  await memoryWriteQueue
  if (existingMemory) return existingMemory
  const persisted = await getAssistantMemories()
  const confirmed = persisted.find(item => item.id === memory.id)
  if (!confirmed) throw new Error('ASSISTANT_MEMORY_PERSIST_FAILED')
  return confirmed
}

export async function deleteAssistantMemory(id: string): Promise<void> {
  memoryWriteQueue = memoryWriteQueue.then(async () => write((await getAssistantMemories()).filter(item => item.id !== id)), async () => write((await getAssistantMemories()).filter(item => item.id !== id)))
  await memoryWriteQueue
}

export async function clearAssistantMemories(): Promise<void> {
  memoryWriteQueue = memoryWriteQueue.then(() => write([]), () => write([]))
  await memoryWriteQueue
}

export function formatAssistantMemories(memories: AssistantMemory[], maxChars = 4000): string {
  return memories.map(memory => `- ${memory.content}`).join('\n').slice(0, Math.max(0, maxChars))
}

const EXPLICIT_MEMORY_PATTERNS = [
  /(?:^|[，,。！？!？\s])(?:请|帮我|你)?(?:记住|记下来|记一下|保存(?:一下)?|长期记忆|以后(?:请)?按这个|记得我)(?:[：:，,\s]*(?:一下|这个|这点)?[：:，,\s]*)(.+)$/iu,
  /(?:以后|今后|接下来)(?:请|都|要)?(?:记住|记得|按照|根据)(?:[：:，,\s]+)(.+)$/iu,
  /(?:把|将)(.+?)(?:记住|记下来|保存为长期记忆|作为长期记忆)(?:[。！？!?，,]|$)/iu
]
const UNSAFE_MEMORY_PATTERN = /(api\s*key|token\s*[:=]|密码|密钥|私钥|secret|system prompt|系统提示词|忽略(?:之前|上面)的指令|越权|绕过安全)/iu

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
