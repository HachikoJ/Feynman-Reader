import { Secret, TOTP } from 'otpauth'

const PERIOD_SECONDS = 30
const DIGITS = 6

export function generateTotpSecret(): string {
  return new Secret({ size: 20 }).base32
}

function totp(secretText: string): TOTP {
  return new TOTP({
    issuer: '费曼读书助手',
    label: '系统管理员',
    secret: Secret.fromBase32(secretText),
    algorithm: 'SHA1',
    digits: DIGITS,
    period: PERIOD_SECONDS,
  })
}

export function createTotpCode(secretText: string, timestamp = Date.now()): string {
  if (!Number.isFinite(timestamp)) throw new Error('TOTP 时间戳无效。')
  return totp(secretText).generate({ timestamp })
}

export function verifyTotpCode(secretText: string, suppliedCode: string, timestamp = Date.now()): boolean {
  if (!/^\d{6}$/.test(suppliedCode) || !Number.isFinite(timestamp)) return false
  try {
    return totp(secretText).validate({ token: suppliedCode, timestamp, window: 1 }) !== null
  } catch {
    return false
  }
}
