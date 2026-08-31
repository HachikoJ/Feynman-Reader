-- Optional username/password account channel.
-- Passwords are stored as server-generated scrypt hashes, never plaintext.

alter table public.app_users
  add column if not exists username text unique,
  add column if not exists password_hash text;

alter table public.app_users
  add constraint app_users_username_length
  check (username is null or char_length(username) between 3 and 32);

alter table public.app_users
  add constraint app_users_password_hash_format
  check (password_hash is null or password_hash like 'scrypt$16384$8$1$%');

create index if not exists app_users_username_idx on public.app_users(username);
