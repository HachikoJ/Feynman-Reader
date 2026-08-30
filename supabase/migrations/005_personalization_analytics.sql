-- Optional, consent-gated product analytics for personalization.
-- Do not put API keys, contact details, precise location, or raw keystrokes here.

alter table public.user_books add column if not exists imported_at timestamptz;
alter table public.user_books add column if not exists last_opened_at timestamptz;
create index if not exists user_books_imported_idx on public.user_books(user_id, imported_at desc);

create table if not exists public.user_behavior_events (
  user_id uuid not null references public.app_users(id) on delete cascade,
  event_id uuid primary key default gen_random_uuid(),
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint user_behavior_event_type_length check (char_length(event_type) between 1 and 80)
);

create index if not exists user_behavior_events_user_time_idx
  on public.user_behavior_events(user_id, occurred_at desc);

alter table public.user_behavior_events enable row level security;
revoke all on table public.user_behavior_events from anon, authenticated;
