import { ArrowLeft, ChevronLeft, ChevronRight, Database, LayoutDashboard, LogOut, Pencil, RotateCcw, Search, ShieldCheck, Trash2, Users, UserRound, FileClock } from 'lucide-react'
import { getPersistence, type AdminDashboard } from '@/lib/server/persistence'
import { ADMIN_DATA_TABLES, ADMIN_DATA_FIELD_LABELS, getAdminDataPage, getAdminDataRecord, getAdminUserProfiles, type AdminUserProfile, AdminDataError } from '@/lib/server/adminData'
import { AdminMutationError, getAdminMutationCapabilities, getAdminEditableRecord, getAdminMutationVersion, listAdminChanges } from '@/lib/server/adminMutations'
import styles from './admin.module.css'

type Query = Record<string, string | string[] | undefined>
const value = (query: Query, key: string, fallback = '') => typeof query[key] === 'string' ? query[key] as string : fallback
const count = (n: number) => new Intl.NumberFormat('zh-CN').format(n)
const actionNames: Record<string, string> = { edit: '保存修改', delete: '删除记录', disable: '停用账号', enable: '启用账号', revoke: '撤销授权', restore: '恢复记录' }
const fieldLabels: Record<string, string> = {
  ...ADMIN_DATA_FIELD_LABELS,
  id: '记录 ID', user_id: '用户 UUID', book_id: '书籍 ID', name: '名称', title: '标题', author: '作者', status: '状态',
  data: '详细数据', content: '正文', documentContent: '文档正文', responses: '六阶段 AI 分析', noteRecords: '笔记记录',
  practiceRecords: '费曼实践', qaPracticeRecords: '问答记录', questions: '问题', attempts: '历次作答', scores: '评分',
  accuracy: '准确性', completeness: '完整性', clarity: '清晰度', overall: '综合得分', recommendations: '相关推荐',
  background: '背景探索', structure: '整体框架', teaching: '以教代学', critical: '辩证分析', reception: '众声回响', synthesis: '融会贯通',
  createdAt: '创建时间', updatedAt: '更新时间', created_at: '创建时间', updated_at: '更新时间',
  aiReview: 'AI 评估', userAnswer: '用户回答', question: '问题', personaName: '提问角色', passed: '是否通过',
  currentPhase: '学习阶段', bestScore: '最佳成绩', analysisTask: '分析任务', completedPhaseIds: '已完成分析阶段',
  readingProgress: '阅读进度', currentPage: '当前页', totalPages: '总页数', percentage: '进度百分比',
  display_name: '昵称', username: '用户名', email: '邮箱', phone: '手机号', tokendance_subject: '观猹身份',
  note: '备注', description: '简介', tags: '标签', category: '类别', messages: '会话消息', role: '角色',
  quotes: '金句', text: '内容', model: '模型', task: '任务', provider: '服务提供方',
}
const enumLabels: Record<string, string> = { unread: '未读', reading: '在读', finished: '已读', running: '进行中', completed: '已完成', failed: '失败', pending: '待处理', super_admin: '超级管理员', admin: '管理员', analyst: '分析员', user: '用户', assistant: '助手', system: '系统' }
const userReferenceLabels: Record<string, string> = { user_id: '所属用户', admin_user_id: '操作管理员', target_user_id: '目标用户', merged_into_user_id: '合并目标用户', granted_by: '授权人', restored_by: '恢复操作人' }
type UserProfiles = Record<string, AdminUserProfile>

function referencedUsers(rows: Record<string, unknown>[], tableId: string): string[] {
  return [...new Set(rows.flatMap(row => Object.entries(row)
    .filter(([key, id]) => (Object.hasOwn(userReferenceLabels, key) || (tableId === 'app_users' && key === 'id')) && typeof id === 'string')
    .map(([, id]) => id as string)))]
}

function avatarSource(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  if (/^data:image\/(?:png|jpeg|gif|webp);base64,/i.test(value)) return value
  if (!/^https?:\/\//i.test(value) && !/^\/(?!\/)/.test(value)) return undefined
  try { return new URL(value, 'https://reader.deline.top').href } catch { return undefined }
}

function UserIdentity({ userId, profiles }: { userId: string; profiles: UserProfiles }) {
  if (!userId) return <span className={styles.secondary}>未关联用户</span>
  const user = profiles[userId.toLowerCase()]
  const name = user?.displayName || user?.username || (user ? '未设置用户名' : '未知用户')
  const avatar = avatarSource(user?.avatarUrl)
  return <a className={styles.userIdentity} href={href({}, { view: 'users', table: 'app_users', record: Buffer.from(JSON.stringify({ id: userId })).toString('base64url') })}>
    <span className={styles.avatar} role="img" aria-label={`${name}的头像`}>
      {user?.displayName || user?.username ? <span>{Array.from(name)[0]}</span> : <UserRound size={19} />}
      {avatar && <span className={styles.avatarImage} style={{ backgroundImage: `url(${JSON.stringify(avatar)})` }} />}
    </span>
    <span className={styles.userText}><strong>{name}</strong>{user?.username && user.username !== name && <small>@{user.username}</small>}<code>{userId}</code></span>
  </a>
}

function href(query: Query, changes: Record<string, string | undefined>): string {
  const params = new URLSearchParams()
  for (const [key, val] of Object.entries(query)) if (typeof val === 'string' && !['success', 'error', 'authError'].includes(key)) params.set(key, val)
  for (const [key, val] of Object.entries(changes)) {
    if (val === undefined) params.delete(key)
    else params.set(key, val)
  }
  return `/admin/?${params}`
}

function display(input: unknown, key = ''): string {
  if (input === null || input === undefined || input === '') return '—'
  if (typeof input === 'boolean') return input ? '是' : '否'
  if (typeof input === 'object') return Array.isArray(input) ? `${input.length} 项` : '查看详情'
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:/.test(input)) return new Date(input).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
  return ['status', 'role', 'migration_status'].includes(key) ? enumLabels[String(input)] || String(input) : String(input)
}

function Fields({ input, depth = 0, profiles = {}, tableId = '' }: { input: unknown; depth?: number; profiles?: UserProfiles; tableId?: string }) {
  if (input === null || typeof input !== 'object') return <div className={styles.prose}>{display(input)}</div>
  return <dl className={styles.fields}>{Object.entries(input).map(([key, field]) => <div className={styles.field} key={key}>
    <dt>{Array.isArray(input) ? `第 ${Number(key) + 1} 条` : userReferenceLabels[key] || fieldLabels[key] || key}</dt>
    <dd>{depth === 0 && typeof field === 'string' && (Object.hasOwn(userReferenceLabels, key) || (tableId === 'app_users' && key === 'id'))
      ? <UserIdentity userId={field} profiles={profiles} />
      : field !== null && typeof field === 'object'
      ? <details open={depth < 1}><summary>{Array.isArray(field) ? `${field.length} 条记录` : '展开字段'}</summary><Fields input={field} depth={depth + 1} /></details>
      : <div className={styles.prose}>{/(?:At|_at)$/.test(key) && typeof field === 'number' ? new Date(field).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : display(field, key)}</div>}</dd>
  </div>)}</dl>
}

function Dashboard({ data }: { data: AdminDashboard }) {
  const metrics = [
    ['用户总数', count(data.users.total), `近 30 天新增 ${count(data.users.newLast30Days)}`],
    ['云端书籍', count(data.books.total), `在读 ${count(data.books.active)} · 回收站 ${count(data.books.recycleBin)}`],
    ['AI 请求（30 天）', count(data.ai.requestsLast30Days), `${count(data.ai.totalTokensLast30Days)} tokens`],
    ['近 7 天活跃用户', count(data.users.activeLast7Days), `行为事件 ${count(data.activity.eventsLast30Days)}`],
  ]
  return <><div className={styles.metrics}>{metrics.map(([label, amount, detail]) => <div key={label}><span>{label}</span><strong>{amount}</strong><small>{detail}</small></div>)}</div>
    <div className={styles.dashboardGrid}>
      <section><h2>书籍状态</h2>{Object.entries(data.books.byStatus).map(([status, amount]) => <div className={styles.bar} key={status}><div><span>{enumLabels[status] || '未知状态'}</span><span>{count(amount)}</span></div><progress max={Math.max(1, data.books.total)} value={amount} /></div>)}</section>
      <section><h2>费曼六阶段</h2>{Object.entries(data.books.byPhase).sort(([a], [b]) => Number(a) - Number(b)).map(([phase, amount]) => <div className={styles.bar} key={phase}><div><span>阶段 {phase}</span><span>{count(amount)}</span></div><progress max={Math.max(1, data.books.total)} value={amount} /></div>)}</section>
      <section><h2>AI 用量（近 30 天）</h2><Fields input={{ 输入: count(data.ai.promptTokensLast30Days), 输出: count(data.ai.completionTokensLast30Days), 合计: count(data.ai.totalTokensLast30Days) }} /></section>
      <section><h2>存储概览</h2><Fields input={{ 用户数据: `${(data.activity.storageBytes / 1048576).toFixed(1)} MB`, 回收站: `${(data.activity.recycleBinBytes / 1048576).toFixed(1)} MB` }} /></section>
    </div><p className={styles.secondary}>数据生成于 {display(data.generatedAt)}</p></>
}

async function DataBrowser({ query, adminUserId }: { query: Query; adminUserId: string }) {
  const tableId = value(query, 'table', value(query, 'view') === 'users' ? 'app_users' : 'user_books')
  const table = ADMIN_DATA_TABLES.find(item => item.id === tableId)
  if (!table) throw new AdminDataError('数据表不存在。', 404)
  const columns = tableId === 'app_users'
    ? [{ key: 'id', label: '用户' }, ...table.columns.filter(column => !['display_name', 'username'].includes(column.key))]
    : table.columns.map(column => ({ ...column, label: userReferenceLabels[column.key] || column.label }))
  const recordKey = value(query, 'record')
  const common = { table: tableId, userId: value(query, 'userId'), search: value(query, 'search'), from: value(query, 'from'), to: value(query, 'to') }
  if (recordKey) {
    const record = await getAdminDataRecord(tableId, recordKey)
    if (!record) return <p role="alert">记录不存在或已被删除。<a href={href(query, { record: undefined, mode: undefined })}>返回列表</a></p>
    const profiles = await getAdminUserProfiles(referencedUsers([record.fields], tableId))
    const capabilities = getAdminMutationCapabilities(tableId)
    if (tableId === 'app_users') {
      capabilities.actions = record.fields.id === adminUserId || record.fields.merged_into_user_id ? []
        : capabilities.actions.filter(action => action !== (record.fields.login_disabled_at ? 'disable' : 'enable'))
    }
    const mode = value(query, 'mode')
    const isOperation = capabilities.actions.includes(mode as never)
    const editable = isOperation && mode === 'edit' ? await getAdminEditableRecord(tableId, recordKey) : null
    const version = isOperation ? editable?.version || await getAdminMutationVersion(tableId, recordKey) : ''
    const title = display(record.fields.name || record.fields.display_name || record.fields.title || record.fields.username || record.fields.book_id || record.fields.id || table.label)
    const userId = typeof record.fields.user_id === 'string' ? record.fields.user_id : tableId === 'app_users' ? String(record.fields.id) : ''
    return <>
      <a className={styles.back} href={href(query, { record: undefined, mode: undefined, format: undefined })}><ArrowLeft size={16} />返回{table.label}</a>
      <header className={styles.recordHeader}><div><h2>{title}</h2><p className={styles.secondary}>{table.label}</p>{userId && <div className={styles.recordUser}><UserIdentity userId={userId} profiles={profiles} /></div>}</div>
        <div className={styles.actions}>{capabilities.actions.map(action => <a key={action} className={action === 'delete' || action === 'revoke' ? styles.dangerButton : styles.button} href={href(query, { mode: action })}>{action === 'edit' ? <Pencil size={16} /> : action === 'delete' ? <Trash2 size={16} /> : <ShieldCheck size={16} />}{actionNames[action]}</a>)}</div>
      </header>
      {tableId === 'app_users' && <nav className={styles.userSections}>{ADMIN_DATA_TABLES.filter(item => item.userColumn).map(item => <a key={item.id} href={href({}, { view: 'tables', table: item.id, userId: String(record.fields.id) })}>{item.label}</a>)}</nav>}
      {isOperation && <section className={styles.editor} aria-label="操作确认"><h3>{actionNames[mode]}：{title}</h3>
        <p>{mode === 'edit' ? '提交后更新下方字段。原版本会加密留存；记录已发生变化时将拒绝覆盖。' : mode === 'delete' ? '删除这条记录，先保存加密副本。可在操作历史中恢复；书籍进入回收站。' : mode === 'disable' ? '停用后，该账号不能继续登录和访问账号数据。' : mode === 'enable' ? '重新允许该账号登录。' : '撤销此授权后，相关凭据将不可再使用，此操作不可通过记录恢复撤销。'}</p>
        <form method="post" action="/api/admin/records/" className={styles.form}>
          <input type="hidden" name="table" value={tableId} /><input type="hidden" name="key" value={recordKey} /><input type="hidden" name="version" value={version} /><input type="hidden" name="action" value={mode} />
          {mode === 'edit' && <><label htmlFor="record-patch">可编辑字段（JSON）</label><textarea id="record-patch" name="patch" defaultValue={JSON.stringify(editable?.fields, null, 2)} rows={22} required spellCheck={false} /></>}
          <label htmlFor="record-confirm">输入“确认”执行本次操作</label><input id="record-confirm" name="confirmation" required pattern="确认" autoComplete="off" />
          <div className={styles.actions}><button type="submit" className={mode === 'delete' || mode === 'revoke' ? styles.dangerButton : styles.primaryButton}>{actionNames[mode]}</button><a className={styles.button} href={href(query, { mode: undefined })}>取消</a></div>
        </form>
      </section>}
      <nav className={styles.tabs}><a aria-current={value(query, 'format') !== 'json' ? 'page' : undefined} href={href(query, { format: undefined })}>字段详情</a><a aria-current={value(query, 'format') === 'json' ? 'page' : undefined} href={href(query, { format: 'json' })}>原始业务 JSON</a></nav>
      {value(query, 'format') === 'json' ? <pre className={styles.json}>{JSON.stringify(record.fields, null, 2)}</pre> : <Fields input={record.fields} profiles={profiles} tableId={tableId} />}
    </>
  }
  const page = await getAdminDataPage({ ...common, userId: common.userId || undefined, search: common.search || undefined, from: common.from || undefined, to: common.to || undefined,
    page: Number(value(query, 'page', '1')), pageSize: 25, sort: value(query, 'sort') === 'oldest' ? 'oldest' : 'newest' })
  const profiles = await getAdminUserProfiles([...new Set([...referencedUsers(page.rows.map(row => row.fields), tableId), ...(common.userId ? [common.userId] : [])])])
  return <>
    <form method="get" action="/admin/" className={styles.filters}>
      <input type="hidden" name="view" value={value(query, 'view', 'tables')} />
      <label>数据表<select name="table" defaultValue={tableId}>{ADMIN_DATA_TABLES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <label className={styles.search}>搜索<input name="search" defaultValue={common.search} placeholder="名称、用户或记录标识" /></label>
      <label>用户 UUID<input name="userId" defaultValue={common.userId} /></label>
      <label>起始日期<input type="date" name="from" defaultValue={common.from} /></label><label>结束日期<input type="date" name="to" defaultValue={common.to} /></label>
      <label>顺序<select name="sort" defaultValue={value(query, 'sort', 'newest')}><option value="newest">最新在前</option><option value="oldest">最早在前</option></select></label>
      <button className={styles.primaryButton} type="submit"><Search size={16} />查询</button>
    </form>
    {common.userId && <div className={styles.selectedUser}><UserIdentity userId={common.userId} profiles={profiles} /></div>}
    <div className={styles.tableHeading}><h2>{table.label}</h2><span>{count(page.total)} 条记录</span></div>
    <div className={styles.tableScroll}><table><thead><tr>{columns.map(column => <th key={column.key}>{column.label}</th>)}<th>操作</th></tr></thead><tbody>
      {page.rows.map(row => <tr key={row.key}>{columns.map(column => <td key={column.key}>{typeof row.fields[column.key] === 'string' && (Object.hasOwn(userReferenceLabels, column.key) || (tableId === 'app_users' && column.key === 'id'))
        ? <UserIdentity userId={row.fields[column.key] as string} profiles={profiles} />
        : <span title={display(row.fields[column.key], column.key)}>{display(row.fields[column.key], column.key)}</span>}</td>)}<td><a className={styles.rowLink} href={href(query, { table: tableId, record: row.key, mode: undefined })}>查看详情</a></td></tr>)}
      {!page.rows.length && <tr><td colSpan={columns.length + 1} className={styles.empty}>暂无符合条件的记录</td></tr>}
    </tbody></table></div>
    <div className={styles.pagination}><span>第 {page.page} 页 · 共 {Math.max(1, Math.ceil(page.total / page.pageSize))} 页</span><div className={styles.actions}>
      {page.page > 1 && <a className={styles.button} href={href(query, { table: tableId, page: String(page.page - 1) })}><ChevronLeft size={16} />上一页</a>}
      {page.page * page.pageSize < page.total && <a className={styles.button} href={href(query, { table: tableId, page: String(page.page + 1) })}>下一页<ChevronRight size={16} /></a>}
    </div></div>
  </>
}

async function ChangeHistory({ query }: { query: Query }) {
  const changes = await listAdminChanges({ page: Number(value(query, 'page', '1')), pageSize: 25 })
  const profiles = await getAdminUserProfiles([...new Set(changes.rows.map(change => change.targetUserId).filter(Boolean))])
  return <><h2>操作历史与恢复</h2><div className={styles.tableScroll}><table><thead><tr><th>时间</th><th>数据表</th><th>操作</th><th>目标用户</th><th>恢复</th></tr></thead><tbody>{changes.rows.map(change => <tr key={change.id}>
    <td>{display(change.createdAt)}</td><td>{ADMIN_DATA_TABLES.find(table => table.id === change.table)?.label || change.table}</td><td>{actionNames[change.action] || change.action}</td><td><UserIdentity userId={change.targetUserId} profiles={profiles} /></td>
    <td>{change.restoredAt ? '已恢复' : change.restorable ? <details><summary>恢复此版本</summary><form method="post" action="/api/admin/records/" className={styles.form}><p>恢复此记录操作前的内容；若后续已有修改，将拒绝覆盖。</p><input type="hidden" name="action" value="restore" /><input type="hidden" name="changeId" value={change.id} /><label>输入“确认”<input name="confirmation" required pattern="确认" /></label><button className={styles.button} type="submit"><RotateCcw size={16} />确认恢复</button></form></details> : '不可恢复'}</td>
  </tr>)}</tbody></table>{!changes.rows.length && <p className={styles.empty}>暂无操作记录</p>}</div><div className={styles.pagination}><span>共 {changes.total} 条</span><div className={styles.actions}>{changes.page > 1 && <a href={href(query, { page: String(changes.page - 1) })}>上一页</a>}{changes.page * changes.pageSize < changes.total && <a href={href(query, { page: String(changes.page + 1) })}>下一页</a>}</div></div></>
}

export default async function AdminWorkbench({ query, adminUserId }: { query: Query; adminUserId: string }) {
  const view = value(query, 'view', 'dashboard')
  let adminProfiles: UserProfiles = {}
  let content
  try {
    adminProfiles = await getAdminUserProfiles([adminUserId])
    if (view === 'dashboard') {
      const data = await getPersistence().getAdminDashboard?.()
      if (!data) throw new AdminDataError('管理员看板暂不可用。')
      content = Dashboard({ data })
    } else if (view === 'changes') content = await ChangeHistory({ query })
    else content = await DataBrowser({ query: view === 'logs' ? { ...query, table: 'admin_audit_logs' } : query, adminUserId })
  } catch (error) {
    content = <div role="alert" className={styles.error}><h2>数据暂时无法读取</h2><p>{error instanceof AdminDataError || error instanceof AdminMutationError ? error.message : '读取失败，请重试。数据未被修改。'}</p><a className={styles.button} href={href(query, {})}><RotateCcw size={16} />重新读取</a></div>
  }
  const navigation = [
    { id: 'dashboard', label: '统计看板', icon: LayoutDashboard }, { id: 'users', label: '用户数据', icon: Users },
    { id: 'tables', label: '数据表浏览', icon: Database }, { id: 'changes', label: '操作历史', icon: FileClock }, { id: 'logs', label: '访问日志', icon: ShieldCheck },
  ]
  return <main className={styles.root}>
    <header className={styles.header}><a href="/account/" className={styles.brand}><img src="/icon-192.png" alt="费曼读书助手" width={32} height={32} /><span>费曼读书助手 <strong>系统管理</strong></span></a><form method="post" action="/api/admin/records/"><input type="hidden" name="action" value="logout" /><button className={styles.button} type="submit"><LogOut size={16} />退出管理</button></form></header>
    <div className={styles.shell}><aside className={styles.sidebar}><nav>{navigation.map(({ id, label, icon: Icon }) => <a key={id} href={`/admin/?view=${id}`} aria-current={view === id ? 'page' : undefined}><Icon size={18} />{label}</a>)}</nav><div className={styles.identity}><UserIdentity userId={adminUserId} profiles={adminProfiles} /><small>超级管理员</small></div></aside>
      <div className={styles.workspace}><header className={styles.heading}><h1>{navigation.find(item => item.id === view)?.label || '数据表浏览'}</h1><a href="/account/">个人中心</a></header>
        {value(query, 'success') && <p role="status" className={styles.success}>操作已完成，记录已更新。</p>}
        {content}
      </div></div>
  </main>
}
