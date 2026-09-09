import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import pg from 'pg'

const connectionString = process.env.DATABASE_URL?.trim()
if (!connectionString) throw new Error('DATABASE_URL is not configured.')
const migrationFile = resolve(dirname(fileURLToPath(import.meta.url)), '../supabase/migrations/013_admin_data_changes.sql')
const sql = await readFile(migrationFile, 'utf8')
const url = new URL(connectionString)
const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
const ca = process.env.DATABASE_SSL_CA?.replace(/\\n/g, '\n').trim()
const client = new pg.Client({ connectionString, ssl: local ? false : ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false } })
const readinessSql = `select exists (
  select 1 from pg_class t join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public' and t.relname = 'admin_data_changes' and t.relrowsecurity
    and (select count(*) from pg_attribute a where a.attrelid = t.oid and not a.attisdropped
      and a.attname = any(array['id', 'admin_user_id', 'target_user_id', 'table_name', 'record_key', 'action',
        'snapshot', 'after_version', 'restorable', 'created_at', 'restored_at', 'restored_by'])) = 12
    and has_table_privilege(current_user, t.oid, 'SELECT')
    and has_table_privilege(current_user, t.oid, 'INSERT')
    and has_table_privilege(current_user, t.oid, 'UPDATE')
    and not has_table_privilege('anon', t.oid, 'SELECT,INSERT,UPDATE,DELETE')
    and not has_table_privilege('authenticated', t.oid, 'SELECT,INSERT,UPDATE,DELETE')
) as ready`
try {
  await client.connect()
  await client.query("set lock_timeout = '10s'")
  const ready = await client.query(readinessSql)
  if (!ready.rows[0]?.ready) try { await client.query(sql) } catch (error) {
    // Release locks from any partially executed DDL before the privileged
    // connection retries the migration against the same table.
    await client.query('rollback')
    if (!(error?.code === '42501' && local && process.getuid?.() === 0)) throw error
    const database = decodeURIComponent(url.pathname.slice(1))
    if (!/^[A-Za-z0-9_-]+$/.test(database)) throw new Error('本地数据库名称格式无效。')
    const result = spawnSync('sudo', ['-u', 'postgres', 'psql', '-v', 'ON_ERROR_STOP=1', '--dbname', database,
      '--command', "SET lock_timeout = '10s'", '--file', migrationFile], { stdio: 'inherit' })
    if (result.status !== 0) throw new Error('管理员数据迁移失败。')
    const role = decodeURIComponent(url.username)
    if (!/^[A-Za-z0-9_-]+$/.test(role)) throw new Error('本地数据库账号格式无效。')
    const grant = spawnSync('sudo', ['-u', 'postgres', 'psql', '-v', 'ON_ERROR_STOP=1', '--dbname', database,
      '--command', `GRANT SELECT, INSERT, UPDATE ON public.admin_data_changes TO "${role}"`], { stdio: 'inherit' })
    if (grant.status !== 0) throw new Error('管理员变更存档访问配置失败。')
  }
  const verified = await client.query(readinessSql)
  if (!verified.rows[0]?.ready) throw new Error('管理员变更存档结构或访问权限未就绪。')
  process.stdout.write('管理员数据操作存档迁移已就绪。\n')
} finally { await client.end() }
