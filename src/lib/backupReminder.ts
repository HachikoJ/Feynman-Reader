export const DATA_RISK_ACKNOWLEDGED_KEY = 'feynman-data-risk-acknowledged'
export const DATA_RISK_NOTICE_VERSION = '3'
// Earlier versions recorded a timestamp as soon as a download started, so that
// value cannot be treated as proof that a backup was saved.
export const LAST_BACKUP_AT_KEY = 'feynman-last-successful-backup-at-v1'
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

type BackupDueInput = Omit<BackupWarningInput, 'acknowledged'>

export function isBackupReminderDue({
  bookCount,
  lastBackupAt,
  now = Date.now()
}: BackupDueInput): boolean {
  if (bookCount === 0) return false
  if (!lastBackupAt || !Number.isFinite(lastBackupAt)) return true

  return now - lastBackupAt >= BACKUP_REMINDER_INTERVAL_MS
}

export function shouldShowBackupWarning({
  acknowledged,
  bookCount,
  lastBackupAt,
  now = Date.now()
}: BackupWarningInput): boolean {
  if (!acknowledged) return true
  return isBackupReminderDue({ bookCount, lastBackupAt, now })
}
