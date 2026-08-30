-- Long-lived account content that is not part of a book record.
-- Access remains server-only; browsers never connect to Supabase directly.

create table if not exists public.user_assistant_sessions (
  user_id uuid not null references public.app_users(id) on delete cascade,
  session_id text not null,
  title text not null,
  book_id text,
  data jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (user_id, session_id)
);

create index if not exists user_assistant_sessions_updated_idx
  on public.user_assistant_sessions(user_id, updated_at desc);

alter table public.user_assistant_sessions enable row level security;
revoke all on table public.user_assistant_sessions from anon, authenticated;
