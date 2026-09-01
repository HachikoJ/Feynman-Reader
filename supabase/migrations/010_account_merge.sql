begin;

-- One-time transition from password accounts to Watcha OAuth accounts.
-- Old account rows are retained for audit history, but their credentials and
-- sessions are invalidated after a successful server-side data merge.

alter table public.app_users
  add column if not exists merged_into_user_id uuid
    references public.app_users(id),
  add column if not exists merged_at timestamptz,
  add column if not exists login_disabled_at timestamptz,
  add column if not exists password_account_merged_at timestamptz;

create index if not exists app_users_merged_into_idx
  on public.app_users(merged_into_user_id)
  where merged_into_user_id is not null;

create index if not exists app_users_login_disabled_idx
  on public.app_users(login_disabled_at)
  where login_disabled_at is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'app_users_merge_state_consistency'
      and conrelid = 'public.app_users'::regclass
  ) then
    alter table public.app_users add constraint app_users_merge_state_consistency check (
      (merged_into_user_id is null and merged_at is null)
      or (merged_into_user_id is not null and merged_at is not null
        and login_disabled_at is not null and merged_into_user_id <> id)
    );
  end if;
end $$;

commit;
