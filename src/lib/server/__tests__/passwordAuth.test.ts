import { hashPassword, normalizeUsername, verifyPassword } from '../auth'

describe('password account authentication', () => {
  it('normalizes usernames and verifies scrypt hashes', () => {
    const hash = hashPassword('correct horse battery staple')
    expect(normalizeUsername(' Feynman_User ')).toBe('feynman_user')
    expect(hash.startsWith('scrypt$16384$8$1$')).toBe(true)
    expect(verifyPassword('correct horse battery staple', hash)).toBe(true)
    expect(verifyPassword('wrong password', hash)).toBe(false)
  })

  it('rejects weak passwords and invalid usernames', () => {
    expect(() => hashPassword('short')).toThrow('8～128')
    expect(() => normalizeUsername('ab')).toThrow('3～32')
    expect(() => normalizeUsername('name with space')).toThrow('3～32')
  })
})
