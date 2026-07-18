export const MAX_AI_USAGE_RECORDS = 5000

export interface AIUsageRecord {
  id: string
  task: string
  model: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  createdAt: number
  bookId?: string
  sessionId?: string
}

export interface AIUsageSummary {
  requestCount: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  lastUsedAt: number | null
}

export function summarizeAIUsage(records: AIUsageRecord[]): AIUsageSummary {
  return records.reduce<AIUsageSummary>((summary, record) => ({
    requestCount: summary.requestCount + 1,
    promptTokens: summary.promptTokens + record.promptTokens,
    completionTokens: summary.completionTokens + record.completionTokens,
    totalTokens: summary.totalTokens + record.totalTokens,
    lastUsedAt: Math.max(summary.lastUsedAt || 0, record.createdAt)
  }), {
    requestCount: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    lastUsedAt: null
  })
}
