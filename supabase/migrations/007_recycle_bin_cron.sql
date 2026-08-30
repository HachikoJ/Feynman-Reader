-- Daily hard-delete for recycle-bin rows that reached their server retention deadline.
-- Run after 003_account_migration.sql. Normal books are never matched.

create extension if not exists pg_cron;

do $$
begin
  if exists (
    select 1
    from cron.job
    where jobname = 'feynman_reader_purge_recycle_bin'
  ) then
    perform cron.unschedule('feynman_reader_purge_recycle_bin');
  end if;

  perform cron.schedule(
    'feynman_reader_purge_recycle_bin',
    '17 3 * * *',
    $command$
      delete from public.user_books
      where deleted_at is not null
        and coalesce(purge_at, deleted_at + interval '30 days') <= now();
    $command$
  );
end $$;
