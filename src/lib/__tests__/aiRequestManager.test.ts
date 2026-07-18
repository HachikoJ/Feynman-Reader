import {
  AI_REQUEST_CANCELLED,
  AI_TASK_BUSY,
  aiRequestManager
} from '../aiRequestManager'

describe('global AI request manager', () => {
  it('allows only one active AI task', async () => {
    let release: (() => void) | undefined
    const first = aiRequestManager.run(
      { task: 'phase-analysis' },
      () => new Promise<void>(resolve => { release = resolve })
    )

    await Promise.resolve()

    await expect(aiRequestManager.run(
      { task: 'book-tags' },
      async () => undefined
    )).rejects.toThrow(AI_TASK_BUSY)

    release?.()
    await first
  })

  it('aborts the active network request', async () => {
    const request = aiRequestManager.run(
      { task: 'teaching-evaluation' },
      signal => new Promise<void>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('sdk abort')), { once: true })
      })
    )

    await Promise.resolve()
    expect(aiRequestManager.cancelActive()).toBe(true)
    await expect(request).rejects.toThrow(AI_REQUEST_CANCELLED)
    expect(aiRequestManager.getSnapshot().active).toBeNull()
  })
})
