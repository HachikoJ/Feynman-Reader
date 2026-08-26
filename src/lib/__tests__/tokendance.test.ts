import {
  createTokendancePaymentSession,
  getTokendancePaymentSession
} from '../tokendance'

describe('TokenDance payment session URLs', () => {
  const fetchMock = jest.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetchMock })
  })

  it('accepts an HTTPS payment URL and a TokenDance status URL', async () => {
    const session = {
      id: 'payment-1',
      amount: 10,
      status: 'pending' as const,
      payment_url: 'https://payment.example.com/session-1',
      status_url: 'https://tokendance.space/portal/api/v1/payment/sessions/payment-1',
      expired_at: 1_900_000_000
    }
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ session }) })

    await expect(createTokendancePaymentSession('sk-test', 10)).resolves.toEqual(session)
  })

  it('rejects an insecure payment URL returned by the service', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        session: {
          id: 'payment-1',
          amount: 10,
          status: 'pending',
          payment_url: 'http://payment.example.com/session-1',
          status_url: 'https://tokendance.space/portal/api/v1/payment/sessions/payment-1',
          expired_at: 1_900_000_000
        }
      })
    })

    await expect(createTokendancePaymentSession('sk-test', 10)).rejects.toThrow('insecure payment URL')
  })

  it('does not send the API key to a non-TokenDance status URL', async () => {
    await expect(getTokendancePaymentSession('sk-secret', 'https://example.com/status')).rejects.toThrow('status URL is invalid')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
