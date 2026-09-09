import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Script } from 'node:vm'

const script = readFileSync(resolve(process.cwd(), 'scripts/verify-admin-security.mjs'), 'utf8').replace("import pg from 'pg'", '')
const adminId = '00000000-0000-4000-8000-000000000001'
const subject = 'fixture-watcha-admin'
const boundRole = { user_id: adminId, tokendance_subject: subject, role: 'super_admin' }

async function verify(roles: typeof boundRole[], binding: Record<string, string | undefined> = {}): Promise<string> {
  const query = jest.fn(async (sql: string) => {
    if (sql.includes('select table_name\n')) return { rows: ['app_users', 'admin_roles', 'admin_totp_credentials', 'admin_sessions', 'admin_audit_logs', 'admin_daily_metrics'].map(table_name => ({ table_name })) }
    if (sql.includes('column_name, is_nullable')) return { rows: [{ table_name: 'app_users' }, { table_name: 'admin_roles', is_nullable: 'NO' }] }
    if (sql.includes('from pg_indexes')) return { rows: [{ present: true }] }
    if (sql.includes('select count(*)::int as count')) return { rows: [{ count: 0 }] }
    if (sql.includes('select r.user_id')) return { rows: roles }
    throw new Error('Unexpected verification query')
  })
  const end = jest.fn().mockResolvedValue(undefined)
  const writes: string[] = []
  const pg = { Client: class { connect = jest.fn().mockResolvedValue(undefined); query = query; end = end } }
  const run = new Script(`(async (pg, process) => { ${script}\n })`).runInNewContext() as (pg: unknown, process: unknown) => Promise<void>
  try {
    await run(pg, { env: { DATABASE_URL: 'postgresql://localhost/fixture', ...binding }, stdout: { write: (text: string) => writes.push(text) } })
    return writes.join('')
  } finally { expect(end).toHaveBeenCalledTimes(1) }
}

describe('deployment administrator identity validation', () => {
  it('allows a new installation with zero active administrators and no binding', async () => {
    expect(await verify([])).toContain('有效管理员角色：0')
  })

  it('requires the existing sole super administrator to match both server bindings', async () => {
    const output = await verify([boundRole], { FEYNMAN_ADMIN_USER_ID: adminId, FEYNMAN_ADMIN_PROVIDER_SUBJECT: subject })
    expect(output).toContain('有效管理员角色：1')
    expect(output).not.toContain(adminId)
    expect(output).not.toContain(subject)
  })

  it.each([
    {},
    { FEYNMAN_ADMIN_USER_ID: adminId },
    { FEYNMAN_ADMIN_PROVIDER_SUBJECT: subject },
    { FEYNMAN_ADMIN_USER_ID: ' ', FEYNMAN_ADMIN_PROVIDER_SUBJECT: subject },
  ])('blocks deployment when an active administrator has incomplete binding (%j)', async binding => {
    await expect(verify([boundRole], binding)).rejects.toThrow('双绑定')
  })

  it.each([
    [boundRole, { ...boundRole, user_id: '00000000-0000-4000-8000-000000000002' }],
    [{ ...boundRole, role: 'admin' }],
    [{ ...boundRole, role: 'analyst' }],
  ])('rejects multiple active administrators or a non-super role (%j)', async (...roles) => {
    await expect(verify(roles, { FEYNMAN_ADMIN_USER_ID: adminId, FEYNMAN_ADMIN_PROVIDER_SUBJECT: subject })).rejects.toThrow('只能存在一个有效超级管理员')
  })

  it.each([
    { FEYNMAN_ADMIN_USER_ID: '00000000-0000-4000-8000-000000000002', FEYNMAN_ADMIN_PROVIDER_SUBJECT: subject },
    { FEYNMAN_ADMIN_USER_ID: adminId, FEYNMAN_ADMIN_PROVIDER_SUBJECT: 'other-fixture-subject' },
  ])('rejects a mismatch in either configured identity field (%j)', async binding => {
    await expect(verify([boundRole], binding)).rejects.toThrow('身份配置不匹配')
  })
})
