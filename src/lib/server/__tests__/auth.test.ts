import { normalizeEmail, normalizePhone, shouldUseSecureCookies, validateBinding } from '../auth'
import { isPersistenceUnavailable } from '../persistence'

describe('auth binding validation', () => {
  it('normalizes mainland phone numbers and emails', () => {
    expect(normalizePhone('138 0013 8000')).toBe('+8613800138000')
    expect(normalizeEmail(' User@Example.COM ')).toBe('user@example.com')
  })

  it('requires phone binding for email login', () => {
    expect(() => validateBinding({ provider: 'email', email: 'a@example.com' })).toThrow('手机号')
    expect(validateBinding({ provider: 'email', email: 'a@example.com', phone: '13800138000' })).toEqual({ email: 'a@example.com', phone: '+8613800138000' })
  })

  it('allows phone login without an email', () => {
    expect(validateBinding({ provider: 'phone', phone: '13800138000' })).toEqual({ phone: '+8613800138000', email: undefined })
  })
})

describe('auth cookie transport', () => {
  afterEach(() => {
    delete process.env.FEYNMAN_COOKIE_SECURE
  })

  it('allows plain HTTP cookies for localhost development', () => {
    expect(shouldUseSecureCookies(new Request('http://localhost:8080/api/auth/me'))).toBe(false)
    expect(shouldUseSecureCookies(new Request('https://reader.deline.top/api/auth/me'))).toBe(true)
  })

  it('honors an explicit deployment override', () => {
    process.env.FEYNMAN_COOKIE_SECURE = 'true'
    expect(shouldUseSecureCookies(new Request('http://localhost:8080/api/auth/me'))).toBe(true)
    process.env.FEYNMAN_COOKIE_SECURE = 'false'
    expect(shouldUseSecureCookies(new Request('https://reader.deline.top/api/auth/me'))).toBe(false)
  })

})

describe('persistence failure classification', () => {
  it('treats missing migrations and database connection failures as unavailable', () => {
    expect(isPersistenceUnavailable({ code: '42P01' })).toBe(true)
    expect(isPersistenceUnavailable({ code: 'ECONNREFUSED' })).toBe(true)
    expect(isPersistenceUnavailable({ code: '23505' })).toBe(false)
  })
})
