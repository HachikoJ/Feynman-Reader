begin;

-- Both supported AI channels use the same encrypted server-side key vault.
alter table public.api_key_records
  drop constraint if exists api_key_records_provider_check;

-- The original migration was deployed with both names in different
-- environments. Keep the upgrade idempotent so older databases can accept
-- the DeepSeek provider without a manual repair step.
alter table public.api_key_records
  drop constraint if exists api_key_provider_check;

alter table public.api_key_records
  add constraint api_key_records_provider_check
  check (provider in ('tokendance', 'deepseek'));

commit;
