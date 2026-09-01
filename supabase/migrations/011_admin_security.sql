-- Server-only administrator security and aggregated analytics.
-- TOTP secrets are encrypted by the application before they are stored.
-- No browser role receives direct access to these tables.

begin;

-- The provider subject is the account identity. Do not allow two accounts to
-- share it, even when an older installation predates the original constraint.
do $$
begin
  if exists (
    select 1
    from public.app_users
    where tokendance_subject is not null
    group by tokendance_subject
    having count(*) > 1
  ) then
    raise exception 'app_users contains duplicate tokendance_subject values; resolve them before enabling OAuth account binding';
  end if;
end $$;

create unique index if not exists app_users_tokendance_subject_unique_idx
  on public.app_users(tokendance_subject)
  where tokendance_subject is not null;

create table if not exists public.admin_roles (
  user_id uuid primary key references public.app_users(id) on delete cascade,
  -- Bind the role to the immutable provider subject, never to a display name.
  tokendance_subject text,
  role text not null default 'super_admin'
    check (role in ('super_admin', 'admin', 'analyst')),
  granted_by uuid references public.app_users(id),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  note text
);

-- Older installations may already have admin_roles without the subject column.
-- Backfill only from the canonical OAuth subject and refuse to enable an
-- incomplete administrator record.
alter table public.admin_roles
  add column if not exists tokendance_subject text;

update public.admin_roles r
set tokendance_subject = u.tokendance_subject
from public.app_users u
where u.id = r.user_id
  and r.tokendance_subject is null;

do $$
begin
  if exists (select 1 from public.admin_roles where tokendance_subject is null) then
    raise exception 'admin_roles contains records without tokendance_subject; re-bootstrap those administrators before enabling the admin dashboard';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'admin_roles_tokendance_subject_length') then
    alter table public.admin_roles add constraint admin_roles_tokendance_subject_length
      check (char_length(tokendance_subject) between 1 and 255);
  end if;
  alter table public.admin_roles alter column tokendance_subject set not null;
end $$;

create index if not exists admin_roles_active_idx
  on public.admin_roles(role)
  where revoked_at is null;

create table if not exists public.admin_totp_credentials (
  user_id uuid primary key references public.app_users(id) on delete cascade,
  secret_ciphertext jsonb not null,
  encryption_key_version integer not null default 1,
  enabled boolean not null default false,
  enrolled_at timestamptz,
  last_used_at timestamptz,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (failed_attempts >= 0)
);

create table if not exists public.admin_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  code_hash text not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists admin_recovery_codes_user_idx
  on public.admin_recovery_codes(user_id, used_at);

create table if not exists public.admin_sessions (
  id_hash text primary key,
  user_id uuid not null references public.app_users(id) on delete cascade,
  expires_at timestamptz not null,
  mfa_verified_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  ip_hash text,
  user_agent_hash text,
  constraint admin_sessions_id_hash_length check (char_length(id_hash) = 64)
);

create index if not exists admin_sessions_user_idx
  on public.admin_sessions(user_id, expires_at desc);

create index if not exists admin_sessions_expiry_idx
  on public.admin_sessions(expires_at)
  where revoked_at is null;

create table if not exists public.admin_audit_logs (
  event_id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references public.app_users(id) on delete set null,
  action text not null,
  target_user_id uuid references public.app_users(id) on delete set null,
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  ip_hash text,
  occurred_at timestamptz not null default now(),
  constraint admin_audit_action_length check (char_length(action) between 1 and 100)
);

create index if not exists admin_audit_logs_time_idx
  on public.admin_audit_logs(occurred_at desc);

create index if not exists admin_audit_logs_admin_idx
  on public.admin_audit_logs(admin_user_id, occurred_at desc);

create index if not exists admin_audit_logs_target_idx
  on public.admin_audit_logs(target_user_id, occurred_at desc);

-- Dashboard reads only pre-aggregated values, never raw user content.
create table if not exists public.admin_daily_metrics (
  metric_date date primary key,
  registered_users integer not null default 0,
  active_users integer not null default 0,
  new_books integer not null default 0,
  active_books integer not null default 0,
  completed_books integer not null default 0,
  ai_requests bigint not null default 0,
  prompt_tokens bigint not null default 0,
  completion_tokens bigint not null default 0,
  total_tokens bigint not null default 0,
  behavior_events bigint not null default 0,
  storage_bytes bigint not null default 0,
  recycle_bin_bytes bigint not null default 0,
  updated_at timestamptz not null default now(),
  constraint admin_daily_metrics_nonnegative check (
    registered_users >= 0 and active_users >= 0 and new_books >= 0
    and active_books >= 0 and completed_books >= 0
    and ai_requests >= 0 and prompt_tokens >= 0
    and completion_tokens >= 0 and total_tokens >= 0
    and behavior_events >= 0 and storage_bytes >= 0
    and recycle_bin_bytes >= 0
  )
);

alter table public.admin_roles enable row level security;
alter table public.admin_totp_credentials enable row level security;
alter table public.admin_recovery_codes enable row level security;
alter table public.admin_sessions enable row level security;
alter table public.admin_audit_logs enable row level security;
alter table public.admin_daily_metrics enable row level security;

revoke all on table
  public.admin_roles,
  public.admin_totp_credentials,
  public.admin_recovery_codes,
  public.admin_sessions,
  public.admin_audit_logs,
  public.admin_daily_metrics
from anon, authenticated;

commit;
