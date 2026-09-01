/* Deployment-time verification for the server-only administrator boundary. */
import pg from 'pg'

const connectionString = process.env.DATABASE_URL?.trim()
if (!connectionString) throw new Error('DATABASE_URL is not configured.')

const ca = process.env.DATABASE_SSL_CA?.replace(/\\n/g, '\n').trim()
const client = new pg.Client({
  connectionString,
  ssl: ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false },
})

function assert(condition, message) {
  if (!condition) throw new Error(`管理员安全校验失败：${message}`)
}

try {
  await client.connect()

  const tables = await client.query(`select table_name
    from information_schema.tables
    where table_schema = 'public' and table_name = any($1::text[])`, [[
      'app_users',
      'admin_roles',
      'admin_totp_credentials',
      'admin_sessions',
      'admin_audit_logs',
      'admin_daily_metrics',
    ]])
  const tableSet = new Set(tables.rows.map(row => row.table_name))
  assert(tableSet.size === 6, '管理员或账号基础表不完整，请让部署迁移重新执行。')

  const columns = await client.query(`select table_name, column_name, is_nullable
    from information_schema.columns
    where table_schema = 'public'
      and ((table_name = 'app_users' and column_name = 'tokendance_subject')
        or (table_name = 'admin_roles' and column_name = 'tokendance_subject'))`)
  const columnByTable = new Map(columns.rows.map(row => [row.table_name, row]))
  assert(columnByTable.has('app_users'), 'app_users 缺少观猹主体字段。')
  assert(columnByTable.get('admin_roles')?.is_nullable === 'NO', 'admin_roles 主体字段必须为非空。')

  const uniqueIndex = await client.query(`select exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'app_users'
      and indexdef ilike '%unique%' and indexdef ilike '%tokendance_subject%'
  ) as present`)
  assert(uniqueIndex.rows[0]?.present === true, '观猹主体字段缺少唯一索引。')

  const duplicateSubjects = await client.query(`select count(*)::int as count from (
    select tokendance_subject
    from public.app_users
    where tokendance_subject is not null
    group by tokendance_subject
    having count(*) > 1
  ) duplicates`)
  assert(Number(duplicateSubjects.rows[0]?.count || 0) === 0, '发现重复的观猹主体标识。')

  const invalidRoles = await client.query(`select count(*)::int as count
    from public.admin_roles r
    left join public.app_users u on u.id = r.user_id
    where r.tokendance_subject is null
      or u.id is null
      or u.tokendance_subject is null
      or u.tokendance_subject <> r.tokendance_subject
      or r.role not in ('super_admin', 'admin', 'analyst')`)
  assert(Number(invalidRoles.rows[0]?.count || 0) === 0, '管理员角色与账号主体不一致，或包含无效角色。')

  const activeRoles = await client.query(`select count(*)::int as count
    from public.admin_roles r
    join public.app_users u on u.id = r.user_id
    where r.revoked_at is null and u.login_disabled_at is null`)
  process.stdout.write(`管理员安全校验通过。已绑定的有效管理员角色：${Number(activeRoles.rows[0]?.count || 0)}。\n`)
} finally {
  await client.end().catch(() => undefined)
}
