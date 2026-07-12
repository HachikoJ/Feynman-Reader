export function clampCompletedPhaseCount(completedCount: number, totalPhases: number): number {
  if (!Number.isFinite(completedCount) || totalPhases <= 0) return 0
  return Math.min(totalPhases, Math.max(0, Math.floor(completedCount)))
}

export function getInitialPhaseIndex(
  completedCount: number,
  totalPhases: number,
  hasResponses: boolean
): number {
  if (totalPhases <= 0) return 0
  if (hasResponses) return 0

  return Math.min(clampCompletedPhaseCount(completedCount, totalPhases), totalPhases - 1)
}

export function isPhaseCompleted(phaseIndex: number, completedCount: number): boolean {
  return phaseIndex < completedCount
}

export function isPhaseUnlocked(phaseIndex: number, completedCount: number): boolean {
  return phaseIndex <= completedCount
}

export function completePhase(phaseIndex: number, completedCount: number, totalPhases: number): number {
  const normalizedCount = clampCompletedPhaseCount(completedCount, totalPhases)
  if (phaseIndex !== normalizedCount) return normalizedCount

  return clampCompletedPhaseCount(normalizedCount + 1, totalPhases)
}
