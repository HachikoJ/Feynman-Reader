import {
  createTokendancePaymentSession,
  fetchTokendanceBalance,
  getTokendancePaymentSession,
  createTokendanceAuthorizationUrl,
  exchangeTokendanceCode,
  TOKENDANCE_APP_URL,
  TOKENDANCE_CALLBACK_ORIGIN
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
    const [requestUrl, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(requestUrl).toBe('https://tokendance.space/portal/api/v1/payment/sessions')
    expect(requestUrl).not.toContain('sk-test')
    expect(new Headers(requestInit.headers).get('Authorization')).toBe('Bearer sk-test')
  })

  it('uses the authenticated account proxy for a server-managed key', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ credits: 100, credits_used: 25, balance: 75 }) })

    await expect(fetchTokendanceBalance('server-managed')).resolves.toEqual({ credits: 100, credits_used: 25, balance: 75 })
    expect(fetchMock).toHaveBeenCalledWith('/api/account/tokendance/', expect.objectContaining({
      method: 'GET',
      credentials: 'include',
    }))
    expect(JSON.stringify(fetchMock.mock.calls[0])).not.toContain('Authorization')
    expect(JSON.stringify(fetchMock.mock.calls[0])).not.toContain('server-managed')
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

describe('TokenDance OAuth code exchange', () => {
  const fetchMock = jest.fn()
  const session = new Map<string, string>()
  const originalWindow = globalThis.window
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
  const verifierKey = 'feynman-tokendance-pkce-verifier'
  const stateKey = 'feynman-tokendance-oauth-state'

  beforeEach(() => {
    fetchMock.mockReset()
    session.clear()
    session.set(verifierKey, 'fixture-verifier')
    session.set(stateKey, 'fixture-state')
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetchMock })
    Object.defineProperty(globalThis, 'window', { configurable: true, value: {} })
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => session.get(key) ?? null,
        removeItem: (key: string) => session.delete(key),
      },
    })
  })

  afterEach(() => {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow })
    if (originalStorage) Object.defineProperty(globalThis, 'sessionStorage', originalStorage)
    else Reflect.deleteProperty(globalThis, 'sessionStorage')
  })

  it('exchanges with only CORS-allowed headers and consumes local PKCE state after success', async () => {
    const key = 'fixture-authorized-token-key'
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ key }) })

    await expect(exchangeTokendanceCode('fixture-code', 'fixture-state')).resolves.toBe(key)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://tokendance.space/portal/api/v1/auth/keys')
    expect(Object.fromEntries(new Headers(init.headers))).toEqual({ 'content-type': 'application/json' })
    expect(JSON.parse(init.body as string)).toEqual({
      code: 'fixture-code', code_verifier: 'fixture-verifier', code_challenge_method: 'S256',
    })
    expect(session.has(verifierKey)).toBe(false)
    expect(session.has(stateKey)).toBe(false)
  })

  it('does not exchange a code from a different authorization flow', async () => {
    await expect(exchangeTokendanceCode('fixture-code', 'other-state')).rejects.toThrow('state expired or did not match')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('retains PKCE state if the exchange is rejected', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403 })
    await expect(exchangeTokendanceCode('expired-code', 'fixture-state')).rejects.toThrow('(403)')
    expect(session.get(verifierKey)).toBe('fixture-verifier')
    expect(session.get(stateKey)).toBe('fixture-state')
  })
})

describe('TokenDance OAuth attribution and callback', () => {
  it('keeps app attribution separate from the fixed product callback origin', async () => {
    const originalWindow = globalThis.window
    const originalCrypto = globalThis.crypto
    const session = new Map<string, string>()
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        crypto: { subtle: { digest: async () => new Uint8Array(32).buffer } },
        location: { origin: 'https://www.deline.top' },
        sessionStorage: {
          setItem: (key: string, value: string) => session.set(key, value),
          getItem: (key: string) => session.get(key) ?? null
        }
      }
    })
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: {
        setItem: (key: string, value: string) => session.set(key, value),
        getItem: (key: string) => session.get(key) ?? null
      }
    })
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: {
        randomUUID: () => 'test-id',
        subtle: { digest: async () => new Uint8Array(32).buffer }
      }
    })

    try {
      const authorizationUrl = await createTokendanceAuthorizationUrl()
      const params = new URL(authorizationUrl).searchParams
      expect(params.get('app_url')).toBe(TOKENDANCE_APP_URL)
    expect(params.get('app_url')).toBe('https://www.deline.top')
      expect(params.get('callback_url')).toContain(`${TOKENDANCE_CALLBACK_ORIGIN}/?view=settings&tokendance_callback=1`)
      expect(params.get('callback_url')).not.toContain('www.deline.top/?view=settings')
      expect(authorizationUrl).not.toContain('apiKey')
      expect(authorizationUrl).not.toContain('sk-test')
    } finally {
      Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow })
      Object.defineProperty(globalThis, 'crypto', { configurable: true, value: originalCrypto })
      Reflect.deleteProperty(globalThis, 'sessionStorage')
    }
  })
})
