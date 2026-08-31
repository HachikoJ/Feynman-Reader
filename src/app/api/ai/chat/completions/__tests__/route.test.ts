const mockCompletionCreate = jest.fn()

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn(() => ({ chat: { completions: { create: mockCompletionCreate } } }))
}))

jest.mock('@/lib/server/apiKeyVault', () => ({ decryptApiKey: jest.fn(() => 'sk-test') }))
jest.mock('@/lib/server/persistence', () => ({
  getPersistence: jest.fn(() => ({ getApiKey: jest.fn(async () => ({ secret: {} })) }))
}))
jest.mock('@/lib/server/sessionUser', () => ({ sessionUserId: jest.fn(async () => 'user-1') }))

import { POST } from '../route'

describe('AI completion proxy', () => {
  beforeEach(() => {
    mockCompletionCreate.mockReset()
  })

  it('retries TokenDance JSON requests without unsupported response_format', async () => {
    mockCompletionCreate
      .mockRejectedValueOnce(Object.assign(new Error('response_format json_object is not supported'), { status: 400 }))
      .mockResolvedValueOnce({ choices: [{ message: { content: '{"ok":true}' } }] })

    const response = await POST(new Request('https://reader.deline.top/api/ai/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        model: 'deepseek-v4-flash-0731',
        messages: [{ role: 'user', content: 'return JSON' }],
        response_format: { type: 'json_object' }
      })
    }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ choices: [{ message: { content: '{"ok":true}' } }] })
    expect(mockCompletionCreate).toHaveBeenCalledTimes(2)
    expect(mockCompletionCreate.mock.calls[0][0].response_format).toEqual({ type: 'json_object' })
    expect(mockCompletionCreate.mock.calls[1][0]).not.toHaveProperty('response_format')
  })
})
