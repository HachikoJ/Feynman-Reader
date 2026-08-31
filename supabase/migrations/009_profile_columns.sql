-- Canonical account profile fields. The JSON profile remains as a backwards
-- compatibility fallback for records created before this migration.

alter table public.app_users
  add column if not exists display_name text,
  add column if not exists avatar_url text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'app_users_display_name_length') then
    alter table public.app_users add constraint app_users_display_name_length
      check (display_name is null or char_length(display_name) between 1 and 40);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'app_users_avatar_url_length') then
    alter table public.app_users add constraint app_users_avatar_url_length
      check (avatar_url is null or char_length(avatar_url) between 1 and 1_500_000);
  end if;
end $$;

update public.app_users u
set
  display_name = coalesce(
    u.display_name,
    nullif(left(s.data->'profile'->>'customDisplayName', 40), ''),
    nullif(left(s.data->'profile'->>'watchaNickname', 40), '')
  ),
  avatar_url = coalesce(
    u.avatar_url,
    nullif(left(s.data->'profile'->>'customAvatarUrl', 1500000), ''),
    nullif(left(s.data->'profile'->>'watchaAvatarUrl', 1500000), '')
  )
from public.user_settings s
where s.user_id = u.id
  and (u.display_name is null or u.avatar_url is null);

create index if not exists app_users_display_name_idx on public.app_users(display_name);
