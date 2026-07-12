let fallbackSequence = 0

export function createLocalId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  fallbackSequence = (fallbackSequence + 1) % Number.MAX_SAFE_INTEGER
  return `${Date.now()}-${fallbackSequence}`
}
