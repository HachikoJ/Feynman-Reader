-- Feynman Reader account storage.
-- This file contains schema only. Never put passwords, API keys, or OAuth secrets here.

create extension if not exists pgcrypto;

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  tokendance_subject text unique,
  phone text unique,
  email text unique,
  phone_verified_at timestamptz,
  email_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_users_tokendance_subject_length check (tokendance_subject is null or char_length(tokendance_subject) between 1 and 255),
  constraint app_users_phone_length check (phone is null or char_length(phone) between 8 and 32),
  constraint app_users_email_length check (email is null or char_length(email) between 3 and 254)
);

create table if not exists public.auth_sessions (
  id_hash text primary key,
  user_id uuid not null references public.app_users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_used_at timestamptz,
  constraint auth_sessions_id_hash_length check (char_length(id_hash) = 64)
);

create index if not exists auth_sessions_user_id_idx on public.auth_sessions(user_id);
create index if not exists auth_sessions_expires_at_idx on public.auth_sessions(expires_at);

create table if not exists public.api_key_records (
  user_id uuid not null references public.app_users(id) on delete cascade,
  provider text not null,
  secret jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, provider),
  constraint api_key_records_provider_check check (provider in ('tokendance'))
);

-- The application uses a server-side database connection. No browser role gets
-- direct table access; the server adapter remains the only data access path.
alter table public.app_users enable row level security;
alter table public.auth_sessions enable row level security;
alter table public.api_key_records enable row level security;

revoke all on table public.app_users from anon, authenticated;
revoke all on table public.auth_sessions from anon, authenticated;
revoke all on table public.api_key_records from anon, authenticated;
