import { createTotpCode, generateTotpSecret, verifyTotpCode } from '../adminTotp'

describe('administrator TOTP', () => {
  it('generates and verifies a code with the supported clock window', () => {
    const secret = generateTotpSecret()
    const timestamp = 1_700_000_000_000
    const code = createTotpCode(secret, timestamp)
    expect(code).toMatch(/^\d{6}$/)
    expect(verifyTotpCode(secret, code, timestamp)).toBe(true)
    expect(verifyTotpCode(secret, code, timestamp + 30_000)).toBe(true)
  })

  it('rejects malformed or incorrect codes', () => {
    const secret = generateTotpSecret()
    expect(verifyTotpCode(secret, '123', Date.now())).toBe(false)
    expect(verifyTotpCode(secret, '000000', Date.now())).toBe(false)
  })
})
