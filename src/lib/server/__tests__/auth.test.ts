import { normalizeEmail, normalizePhone, validateBinding } from '../auth'

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
