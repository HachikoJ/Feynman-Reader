/* One-time, server-local administrator bootstrap. Never expose this as an HTTP route. */
import { createCipheriv, createHash, randomBytes } from 'node:crypto'
import pg from 'pg'
import { Secret, TOTP } from 'otpauth'

const connectionString = process.env.DATABASE_URL?.trim()
const userId = process.env.ADMIN_USER_ID?.trim()
const configuredKey = process.env.FEYNMAN_API_KEY_ENCRYPTION_KEY?.trim()
if (!connectionString || !userId || !configuredKey) throw new Error('需要 DATABASE_URL、ADMIN_USER_ID 和 FEYNMAN_API_KEY_ENCRYPTION_KEY。')

const key = /^[0-9a-f]{64}$/i.test(configuredKey) ? Buffer.from(configuredKey, 'hex') : Buffer.from(configuredKey, 'base64')
if (key.length !== 32) throw new Error('FEYNMAN_API_KEY_ENCRYPTION_KEY 必须解码为 32 字节。')
const secret = new Secret({ size: 20 }).base32
const iv = randomBytes(12)
const cipher = createCipheriv('aes-256-gcm', key, iv)
const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
const encode = value => value.toString('base64url')
const encrypted = {
  version: 'v1', ciphertext: encode(ciphertext), iv: encode(iv), authTag: encode(cipher.getAuthTag()),
  keyFingerprint: createHash('sha256').update(key).digest('hex').slice(0, 16),
}
const otp = new TOTP({ issuer: '费曼读书助手', label: '系统管理员', secret: Secret.fromBase32(secret), algorithm: 'SHA1', digits: 6, period: 30 })
const ca = process.env.DATABASE_SSL_CA?.replace(/\\n/g, '\n').trim()
const client = new pg.Client({ connectionString, ssl: ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false } })
try {
  await client.connect()
  const user = await client.query('select id, tokendance_subject from public.app_users where id = $1 and login_disabled_at is null', [userId])
  if (!user.rows[0]?.tokendance_subject) throw new Error('目标账号不存在、已停用或没有有效的观猹主体。')
  await client.query('begin')
  await client.query(`insert into public.admin_roles (user_id, tokendance_subject, role, revoked_at)
    values ($1, $2, 'super_admin', null)
    on conflict (user_id) do update set tokendance_subject = excluded.tokendance_subject,
      role = 'super_admin', revoked_at = null`, [userId, user.rows[0].tokendance_subject])
  await client.query(`insert into public.admin_totp_credentials
    (user_id, secret_ciphertext, encryption_key_version, enabled, enrolled_at, failed_attempts, locked_until)
    values ($1, $2::jsonb, 1, true, now(), 0, null)
    on conflict (user_id) do update set secret_ciphertext = excluded.secret_ciphertext,
      encryption_key_version = 1, enabled = true, enrolled_at = now(), failed_attempts = 0, locked_until = null, updated_at = now()`, [userId, JSON.stringify(encrypted)])
  await client.query('commit')
  process.stdout.write(`管理员初始化完成。请立即将以下 URI 导入认证器，之后不要再次输出或保存明文密钥：\n${otp.toString()}\n备用密钥：${secret}\n`)
} catch (error) {
  await client.query('rollback').catch(() => undefined)
  throw error
} finally {
  await client.end()
}
