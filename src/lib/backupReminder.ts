export const DATA_RISK_ACKNOWLEDGED_KEY = 'feynman-data-risk-acknowledged'
export const DATA_RISK_NOTICE_VERSION = '3'
export const LAST_BACKUP_AT_KEY = 'feynman-last-backup-at'
export const BACKUP_REMINDER_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000

export function hasAcknowledgedCurrentDataRisk(value: string | null): boolean {
  return value === DATA_RISK_NOTICE_VERSION
}

interface BackupWarningInput {
  acknowledged: boolean
  bookCount: number
  lastBackupAt: number | null
  now?: number
}

export function shouldShowBackupWarning({
  acknowledged,
  bookCount,
  lastBackupAt,
  now = Date.now()
}: BackupWarningInput): boolean {
  if (!acknowledged) return true
  if (bookCount === 0) return false
  if (!lastBackupAt || !Number.isFinite(lastBackupAt)) return true

  return now - lastBackupAt >= BACKUP_REMINDER_INTERVAL_MS
}
