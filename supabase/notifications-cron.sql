-- Provision NOTIFICATION_WORKER_URL and NOTIFICATION_WORKER_AUTH in Vault first.
-- URL: https://YOUR_PRODUCTION_DOMAIN/api/notifications?run=daily
-- AUTH: Bearer <the same NOTIFICATION_CRON_SECRET configured on Vercel>
-- Never put those values in a committed SQL file. Run only after setup checks.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('consultor-daily-notifications','*/5 * * * *', $job$
 select net.http_post(
  url := (select decrypted_secret from vault.decrypted_secrets where name='NOTIFICATION_WORKER_URL'),
  headers := jsonb_build_object('Content-Type','application/json','Authorization',
   (select decrypted_secret from vault.decrypted_secrets where name='NOTIFICATION_WORKER_AUTH')),
  body := '{}'::jsonb,
  timeout_milliseconds := 90000
 );
$job$);
