export const MODEL_CONTEXT_TOKEN_LIMIT = 1_000_000
export const MODEL_CONTEXT_RESERVED_TOKENS = 200_000
export const DEFAULT_DOCUMENT_CONTEXT_CHARS = 600_000

export interface DocumentContext {
  content: string
  sourceLength: number
  includedLength: number
  complete: boolean
  selectedChunks: number
  totalChunks: number
}

function taskTerms(task: string): string[] {
  const normalized = task.toLowerCase()
  const terms = new Set<string>()

  for (const word of normalized.match(/[a-z0-9_]{3,}/g) || []) terms.add(word)
  for (const sequence of normalized.match(/[\u4e00-\u9fff]{2,}/g) || []) {
    const limited = sequence.slice(0, 80)
    for (let index = 0; index < limited.length - 1; index += 1) {
      terms.add(limited.slice(index, index + 2))
    }
  }

  return [...terms].slice(0, 240)
}

function evenlySpacedIndices(total: number, count: number): number[] {
  if (count <= 1 || total <= 1) return [0]
  return Array.from({ length: count }, (_, index) =>
    Math.round(index * (total - 1) / (count - 1)))
}

/**
 * Keeps the full source in storage while building a model-sized context from
 * the entire document. Long documents combine broad positional coverage with
 * task-relevant chunks instead of always truncating the end of the book.
 */
export function buildDocumentContext(
  documentContent: string,
  task: string,
  maxChars = DEFAULT_DOCUMENT_CONTEXT_CHARS
): DocumentContext {
  const source = documentContent.trim()
  if (!source || source.length <= maxChars) {
    return {
      content: source,
      sourceLength: documentContent.length,
      includedLength: source.length,
      complete: true,
      selectedChunks: source ? 1 : 0,
      totalChunks: source ? 1 : 0
    }
  }

  const chunkSize = 2_500
  const chunks = Array.from(
    { length: Math.ceil(source.length / chunkSize) },
    (_, index) => source.slice(index * chunkSize, (index + 1) * chunkSize)
  )
  const capacity = Math.max(3, Math.floor((maxChars - 2_000) / (chunkSize + 80)))
  const selected = new Set(evenlySpacedIndices(chunks.length, Math.ceil(capacity / 2)))
  const terms = taskTerms(task)

  const ranked = chunks
    .map((chunk, index) => ({
      index,
      score: terms.reduce((score, term) => score + (chunk.toLowerCase().includes(term) ? 1 : 0), 0)
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)

  for (const candidate of ranked) {
    if (selected.size >= capacity) break
    selected.add(candidate.index)
  }

  const selectedIndices = [...selected].sort((left, right) => left - right)
  const content = selectedIndices.map(index => {
    const position = Math.round(index / Math.max(1, chunks.length - 1) * 100)
    return `[原文片段 ${index + 1}/${chunks.length}，约位于全文 ${position}%]\n${chunks[index]}`
  }).join('\n\n')

  return {
    content: content.slice(0, maxChars),
    sourceLength: documentContent.length,
    includedLength: selectedIndices.reduce((sum, index) => sum + chunks[index].length, 0),
    complete: false,
    selectedChunks: selectedIndices.length,
    totalChunks: chunks.length
  }
}
