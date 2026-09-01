import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import pg from 'pg'

const connectionString = process.env.DATABASE_URL?.trim()
if (!connectionString) throw new Error('DATABASE_URL is not configured.')
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const migrationFile = resolve(projectRoot, 'supabase/migrations/011_admin_security.sql')
const sql = await readFile(migrationFile, 'utf8')
const ca = process.env.DATABASE_SSL_CA?.replace(/\\n/g, '\n').trim()
const client = new pg.Client({ connectionString, ssl: ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false } })

try {
  await client.connect()
  const ready = await client.query(`select
    (select count(*)::int from information_schema.tables
      where table_schema = 'public' and table_name in
      ('admin_roles', 'admin_totp_credentials', 'admin_sessions', 'admin_audit_logs', 'admin_daily_metrics')) = 5 as tables_ready,
    exists (select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'admin_roles' and column_name = 'tokendance_subject') as subject_ready,
    exists (select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'admin_roles'
        and column_name = 'tokendance_subject' and is_nullable = 'NO') as subject_not_null,
    exists (select 1 from pg_indexes
      where schemaname = 'public' and tablename = 'app_users'
        and indexdef ilike '%unique%' and indexdef ilike '%tokendance_subject%') as subject_unique`)
  if (ready.rows[0]?.tables_ready && ready.rows[0]?.subject_ready && ready.rows[0]?.subject_not_null && ready.rows[0]?.subject_unique) {
    process.stdout.write('管理员安全迁移已就绪。\n')
  } else {
    try {
      await client.query(sql)
    } catch (error) {
      const url = new URL(connectionString)
      const isLocal = ['127.0.0.1', 'localhost', '::1'].includes(url.hostname)
      if (!(error && typeof error === 'object' && 'code' in error && error.code === '42501' && isLocal && process.getuid?.() === 0)) throw error
      const database = decodeURIComponent(url.pathname.slice(1))
      if (!/^[A-Za-z0-9_-]+$/.test(database)) throw new Error('本地数据库名称格式无效。')
      const result = spawnSync('sudo', ['-u', 'postgres', 'psql', '-v', 'ON_ERROR_STOP=1', '--dbname', database, '--file', migrationFile], { stdio: 'inherit' })
      if (result.status !== 0) throw new Error('PostgreSQL 管理身份执行管理员迁移失败。')
    }
    process.stdout.write('管理员安全迁移已就绪。\n')
  }
} finally {
  await client.end()
}
