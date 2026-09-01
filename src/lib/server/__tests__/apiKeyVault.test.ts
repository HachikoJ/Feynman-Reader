import { decryptApiKey, encryptApiKey, maskApiKey } from '../apiKeyVault'

describe('API key vault', () => {
  beforeEach(() => {
    process.env.FEYNMAN_API_KEY_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
  })

  it('round-trips without storing plaintext', () => {
    const plaintext = 'tokendance-secret-key-1234567890'
    const encrypted = encryptApiKey(plaintext)
    expect(JSON.stringify(encrypted)).not.toContain(plaintext)
    expect(decryptApiKey(encrypted)).toBe(plaintext)
  })

  it('rejects tampering and masks display values', () => {
    const encrypted = encryptApiKey('tokendance-secret-key-1234567890')
    const replacement = encrypted.ciphertext.endsWith('A') ? 'B' : 'A'
    expect(() => decryptApiKey({ ...encrypted, ciphertext: encrypted.ciphertext.slice(0, -1) + replacement })).toThrow()
    expect(maskApiKey('tokendance-secret-key-1234567890')).toBe('toke********7890')
  })
})
