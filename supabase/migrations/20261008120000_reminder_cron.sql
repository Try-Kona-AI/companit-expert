-- Daily automatic payment reminders (Kona AI / Companit Expert).
-- pg_cron calls the send-reminders edge function every day at 14:00 UTC
-- (10am New York in summer, 9am in winter). The function URL and the shared
-- secret come from Vault, so no secret lives in this file. Create both Vault
-- entries with scripts/kona-reminders.sh before relying on this job.
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'send-reminders') then
    perform cron.unschedule('send-reminders');
  end if;
end $$;

select cron.schedule(
  'send-reminders',
  '0 14 * * *',
  $job$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
               || '/functions/v1/send-reminders',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_cron_secret')),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $job$
);
