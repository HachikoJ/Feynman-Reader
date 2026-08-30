-- Explicit user-approved Feynman Assistant memories.
-- Run after 005_personalization_analytics.sql.

create table if not exists public.user_assistant_memories (
  user_id uuid not null references public.app_users(id) on delete cascade,
  memory_id text not null,
  content text not null,
  category text not null,
  source_session_id text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (user_id, memory_id),
  constraint user_assistant_memory_content_length check (char_length(content) between 1 and 500),
  constraint user_assistant_memory_category_check check (category in ('preference', 'learning-style', 'goal', 'workflow'))
);

create index if not exists user_assistant_memories_updated_idx
  on public.user_assistant_memories(user_id, updated_at desc);

alter table public.user_assistant_memories enable row level security;
revoke all on table public.user_assistant_memories from anon, authenticated;
