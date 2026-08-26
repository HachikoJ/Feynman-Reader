import {
  BACKUP_REMINDER_INTERVAL_MS,
  DATA_RISK_NOTICE_VERSION,
  hasBackupRelevantLearningData,
  hasAcknowledgedCurrentDataRisk,
  isBackupReminderDue,
  shouldShowBackupWarning
} from '../backupReminder'

describe('hasBackupRelevantLearningData', () => {
  const emptyBook = {
    currentPhase: 0,
    noteRecords: [],
    responses: {},
    practiceRecords: [],
    qaPracticeRecords: [],
    bestScore: 0
  }

  it('ignores the bundled sample and an empty user book', () => {
    expect(hasBackupRelevantLearningData({ ...emptyBook, isSample: true, responses: { background: 'sample' } })).toBe(false)
    expect(hasBackupRelevantLearningData(emptyBook)).toBe(false)
  })

  it('detects actual user learning content', () => {
    expect(hasBackupRelevantLearningData({ ...emptyBook, responses: { background: 'analysis' } })).toBe(true)
    expect(hasBackupRelevantLearningData({ ...emptyBook, noteRecords: [{ content: 'note' }] })).toBe(true)
    expect(hasBackupRelevantLearningData({ ...emptyBook, documentContent: 'uploaded source' })).toBe(true)
  })
})

describe('shouldShowBackupWarning', () => {
  const now = 1_800_000_000_000

  it('requires an initial risk acknowledgement', () => {
    expect(shouldShowBackupWarning({ acknowledged: false, bookCount: 0, lastBackupAt: null, now })).toBe(false)
  })

  it('reminds users with books that have never been backed up', () => {
    expect(shouldShowBackupWarning({ acknowledged: true, bookCount: 1, lastBackupAt: null, now })).toBe(true)
  })

  it('does not remind an acknowledged user with no books', () => {
    expect(shouldShowBackupWarning({ acknowledged: true, bookCount: 0, lastBackupAt: null, now })).toBe(false)
  })

  it('reminds again after seven days', () => {
    expect(shouldShowBackupWarning({
      acknowledged: true,
      bookCount: 1,
      lastBackupAt: now - BACKUP_REMINDER_INTERVAL_MS,
      now
    })).toBe(true)
  })

  it('does not remind when a recent backup exists', () => {
    expect(shouldShowBackupWarning({
      acknowledged: true,
      bookCount: 1,
      lastBackupAt: now - BACKUP_REMINDER_INTERVAL_MS + 1,
      now
    })).toBe(false)
  })
})

describe('isBackupReminderDue', () => {
  const now = 1_800_000_000_000

  it('never marks an empty library as needing a backup', () => {
    expect(isBackupReminderDue({ bookCount: 0, lastBackupAt: null, now })).toBe(false)
    expect(isBackupReminderDue({
      bookCount: 0,
      lastBackupAt: now - BACKUP_REMINDER_INTERVAL_MS,
      now
    })).toBe(false)
  })

  it('marks existing unbacked-up learning data as due', () => {
    expect(isBackupReminderDue({ bookCount: 1, lastBackupAt: null, now })).toBe(true)
  })
})

describe('hasAcknowledgedCurrentDataRisk', () => {
  it('requires acknowledgement of the current notice version', () => {
    expect(hasAcknowledgedCurrentDataRisk(DATA_RISK_NOTICE_VERSION)).toBe(true)
    expect(hasAcknowledgedCurrentDataRisk('true')).toBe(false)
    expect(hasAcknowledgedCurrentDataRisk(null)).toBe(false)
  })
})
