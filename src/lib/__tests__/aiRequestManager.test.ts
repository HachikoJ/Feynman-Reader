import {
  AI_REQUEST_CANCELLED,
  aiRequestManager
} from '../aiRequestManager'

describe('global AI request manager', () => {
  it('allows independent AI tasks to run concurrently', async () => {
    let releaseFirst: (() => void) | undefined
    let releaseSecond: (() => void) | undefined
    const first = aiRequestManager.run(
      { task: 'phase-analysis' },
      () => new Promise<void>(resolve => { releaseFirst = resolve })
    )
    const second = aiRequestManager.run(
      { task: 'assistant-chat', sessionId: 'session-1' },
      () => new Promise<void>(resolve => { releaseSecond = resolve })
    )

    await Promise.resolve()

    expect(aiRequestManager.getSnapshot().activeTasks).toHaveLength(2)
    releaseFirst?.()
    await first
    expect(aiRequestManager.getSnapshot().activeTasks).toHaveLength(1)
    releaseSecond?.()
    await second
    expect(aiRequestManager.getSnapshot().active).toBeNull()
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
