import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12
const AUTH_TAG_BYTES = 16
const VERSION = 'v1'

export interface EncryptedSecret {
  version: typeof VERSION
  ciphertext: string
  iv: string
  authTag: string
  keyFingerprint: string
}

function getEncryptionKey(): Buffer {
  const configured = process.env.FEYNMAN_API_KEY_ENCRYPTION_KEY
  if (!configured) {
    throw new Error('FEYNMAN_API_KEY_ENCRYPTION_KEY is not configured.')
  }

  const normalized = configured.trim()
  const key = /^[0-9a-f]{64}$/i.test(normalized)
    ? Buffer.from(normalized, 'hex')
    : Buffer.from(normalized, 'base64')
  if (key.length !== 32) {
    throw new Error('FEYNMAN_API_KEY_ENCRYPTION_KEY must decode to exactly 32 bytes.')
  }
  return key
}

function fingerprint(key: Buffer): string {
  return createHash('sha256').update(key).digest('hex').slice(0, 16)
}

function encode(value: Buffer): string {
  return value.toString('base64url')
}

function decode(value: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Encrypted API key payload is malformed.')
  const decoded = Buffer.from(value, 'base64url')
  // Reject non-canonical encodings so changing ignored base64url padding bits
  // cannot bypass the authenticated payload check.
  if (decoded.toString('base64url') !== value) throw new Error('Encrypted API key payload is malformed.')
  return decoded
}

/** Encrypt a provider API key. The plaintext must never be persisted or logged. */
export function encryptApiKey(apiKey: string): EncryptedSecret {
  if (typeof apiKey !== 'string' || apiKey.trim().length < 20 || apiKey.length > 4096) {
    throw new Error('API key must be a non-empty secret of at most 4096 characters.')
  }
  const key = getEncryptionKey()
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(apiKey), cipher.final()])
  const authTag = cipher.getAuthTag()
  return {
    version: VERSION,
    ciphertext: encode(ciphertext),
    iv: encode(iv),
    authTag: encode(authTag),
    keyFingerprint: fingerprint(key),
  }
}

/** Decrypt only at the server boundary immediately before an upstream API call. */
export function decryptApiKey(secret: EncryptedSecret): string {
  if (secret.version !== VERSION) throw new Error('Unsupported encrypted API key version.')
  const key = getEncryptionKey()
  if (secret.keyFingerprint !== fingerprint(key)) {
    throw new Error('Encrypted API key was created with a different key.')
  }
  const iv = decode(secret.iv)
  const authTag = decode(secret.authTag)
  const ciphertext = decode(secret.ciphertext)
  if (iv.length !== IV_BYTES || authTag.length !== AUTH_TAG_BYTES || ciphertext.length === 0) {
    throw new Error('Encrypted API key payload is malformed.')
  }
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}

/** Safe display value for settings pages and audit logs. */
export function maskApiKey(apiKey: string): string {
  if (!apiKey) return ''
  if (apiKey.length <= 8) return '*'.repeat(apiKey.length)
  return `${apiKey.slice(0, 4)}${'*'.repeat(Math.min(8, apiKey.length - 8))}${apiKey.slice(-4)}`
}

export function generateEncryptionKey(): string {
  return randomBytes(32).toString('base64url')
}
