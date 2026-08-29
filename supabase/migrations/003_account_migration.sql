-- Account migration state and book recycle bin metadata.
-- Run after 002_user_data.sql in the Supabase SQL editor.

alter table public.user_books
  add column if not exists purge_at timestamptz;

alter table public.user_book_relations
  add column if not exists updated_at timestamptz not null default now();

update public.user_book_relations
set updated_at = created_at;

create index if not exists user_book_relations_updated_idx
  on public.user_book_relations(user_id, updated_at desc);

create index if not exists user_books_purge_idx
  on public.user_books(purge_at)
  where deleted_at is not null;

alter table public.user_data_state
  add column if not exists migration_status text not null default 'pending'
    check (migration_status in ('pending', 'running', 'completed', 'failed')),
  add column if not exists migration_version integer not null default 0,
  add column if not exists migration_started_at timestamptz,
  add column if not exists migration_deadline_at timestamptz,
  add column if not exists migration_completed_at timestamptz,
  add column if not exists last_migration_error text;

create index if not exists user_data_state_migration_deadline_idx
  on public.user_data_state(migration_deadline_at)
  where migration_status in ('pending', 'running', 'failed');

-- Keep recycle-bin records bounded even when a client does not explicitly
-- request cleanup. A deleted book is eligible for physical purge 30 days
-- after deletion; application maintenance invokes the purge query below.
update public.user_books
set purge_at = deleted_at + interval '30 days'
where deleted_at is not null and purge_at is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'user_books_deleted_purge_consistency'
      and conrelid = 'public.user_books'::regclass
  ) then
    alter table public.user_books add constraint user_books_deleted_purge_consistency check (
      (deleted_at is null and purge_at is null)
      or (deleted_at is not null and purge_at is not null
        and purge_at >= deleted_at
        and purge_at <= deleted_at + interval '30 days')
    );
  end if;
end $$;

create table if not exists public.user_aux_data (
  user_id uuid not null references public.app_users(id) on delete cascade,
  namespace text not null,
  data jsonb not null default '{}'::jsonb,
  version bigint not null default 1,
  updated_at timestamptz not null default now(),
  primary key (user_id, namespace)
);

alter table public.user_aux_data enable row level security;
revoke all on table public.user_aux_data from anon, authenticated;
