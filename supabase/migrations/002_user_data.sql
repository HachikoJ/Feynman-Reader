-- Cloud learning data owned by an application account.
-- The application uses the server-side PostgreSQL adapter; browsers never get
-- direct access to these tables or to DATABASE_URL.

create table if not exists public.user_settings (
  user_id uuid primary key references public.app_users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  version bigint not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists public.user_books (
  user_id uuid not null references public.app_users(id) on delete cascade,
  book_id text not null,
  name text not null,
  author text,
  status text not null,
  current_phase integer not null default 0,
  best_score integer not null default 0,
  data jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  primary key (user_id, book_id)
);

create index if not exists user_books_updated_idx on public.user_books(user_id, updated_at desc);
create index if not exists user_books_status_idx on public.user_books(user_id, status);

create table if not exists public.user_ai_usage (
  user_id uuid not null references public.app_users(id) on delete cascade,
  record_id text not null,
  book_id text,
  session_id text,
  task text not null,
  model text not null,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  total_tokens integer not null default 0,
  data jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, record_id)
);

create index if not exists user_ai_usage_created_idx on public.user_ai_usage(user_id, created_at desc);

create table if not exists public.user_book_lists (
  user_id uuid not null references public.app_users(id) on delete cascade,
  list_id text not null,
  name text not null,
  description text,
  book_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (user_id, list_id)
);

create table if not exists public.user_book_relations (
  user_id uuid not null references public.app_users(id) on delete cascade,
  relation_id text not null,
  from_book_id text not null,
  to_book_id text not null,
  relation_type text not null,
  note text,
  created_at timestamptz not null,
  primary key (user_id, relation_id)
);

create index if not exists user_book_relations_from_idx on public.user_book_relations(user_id, from_book_id);
create index if not exists user_book_relations_to_idx on public.user_book_relations(user_id, to_book_id);

create table if not exists public.user_data_state (
  user_id uuid primary key references public.app_users(id) on delete cascade,
  schema_version integer not null default 1,
  sync_version bigint not null default 0,
  last_import_at timestamptz,
  last_sync_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;
alter table public.user_books enable row level security;
alter table public.user_ai_usage enable row level security;
alter table public.user_book_lists enable row level security;
alter table public.user_book_relations enable row level security;
alter table public.user_data_state enable row level security;

revoke all on table public.user_settings, public.user_books, public.user_ai_usage,
  public.user_book_lists, public.user_book_relations, public.user_data_state
  from anon, authenticated;
