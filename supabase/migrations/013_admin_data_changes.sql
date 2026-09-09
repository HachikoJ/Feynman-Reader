-- Server-only encrypted before/after images for explicitly confirmed admin operations.
begin;
create table if not exists public.admin_data_changes (
  id uuid primary key,
  admin_user_id uuid not null references public.app_users(id),
  target_user_id uuid not null references public.app_users(id),
  table_name text not null,
  record_key jsonb not null,
  action text not null check (action in ('edit', 'delete', 'disable', 'enable', 'revoke')),
  snapshot jsonb not null,
  after_version text not null check (char_length(after_version) = 64),
  restorable boolean not null,
  created_at timestamptz not null default now(),
  restored_at timestamptz,
  restored_by uuid references public.app_users(id)
);
create index if not exists admin_data_changes_time_idx on public.admin_data_changes(created_at desc);
create index if not exists admin_data_changes_target_idx on public.admin_data_changes(target_user_id, created_at desc);
alter table public.admin_data_changes enable row level security;
revoke all on public.admin_data_changes from anon, authenticated;
commit;
