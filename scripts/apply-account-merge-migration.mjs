import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import pg from 'pg'

const connectionString = process.env.DATABASE_URL?.trim()
if (!connectionString) throw new Error('DATABASE_URL is not configured.')

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sql = await readFile(resolve(projectRoot, 'supabase/migrations/010_account_merge.sql'), 'utf8')
const apiKeyProviderSql = await readFile(resolve(projectRoot, 'supabase/migrations/012_api_key_providers.sql'), 'utf8')
const ca = process.env.DATABASE_SSL_CA?.replace(/\\n/g, '\n').trim()
const client = new pg.Client({
  connectionString,
  ssl: ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false },
})

try {
  await client.connect()
  const ready = await client.query(`select count(*)::int as count
    from information_schema.columns
    where table_schema = 'public' and table_name = 'app_users'
      and column_name in ('merged_into_user_id', 'merged_at', 'login_disabled_at', 'password_account_merged_at')`)
  if (ready.rows[0]?.count === 4) {
    process.stdout.write('账号合并数据库迁移已就绪。\n')
    process.exitCode = 0
  } else {
    try {
      await client.query(sql)
    } catch (error) {
      const url = new URL(connectionString)
      const isLocal = ['127.0.0.1', 'localhost', '::1'].includes(url.hostname)
      if (!(error && typeof error === 'object' && 'code' in error && error.code === '42501' && isLocal && process.getuid?.() === 0)) throw error
      const database = decodeURIComponent(url.pathname.slice(1))
      if (!/^[A-Za-z0-9_-]+$/.test(database)) throw new Error('本地数据库名称格式无效。')
      const result = spawnSync('sudo', ['-u', 'postgres', 'psql', '-v', 'ON_ERROR_STOP=1', '--dbname', database, '--file', resolve(projectRoot, 'supabase/migrations/010_account_merge.sql')], { stdio: 'inherit' })
      if (result.status !== 0) throw new Error('PostgreSQL 管理身份执行账号合并迁移失败。')
    }
    process.stdout.write('账号合并数据库迁移已就绪。\n')
  }
  await client.query(apiKeyProviderSql)
  process.stdout.write('API Key 渠道数据库迁移已就绪。\n')
} finally {
  await client.end()
}
