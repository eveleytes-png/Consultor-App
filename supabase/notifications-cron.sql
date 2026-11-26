-- Apply in coordination with the new worker. This migration does not write Google Sheets.
-- The existing NOTIFICATION_WORKER_URL and NOTIFICATION_WORKER_AUTH Vault values are reused.
begin;

create table if not exists public.consultor_portfolio_snapshots (
 owner text not null,
 merchant_key text not null,
 email text,
 snapshot jsonb not null,
 primary key (owner, merchant_key)
);
alter table public.consultor_portfolio_snapshots add column if not exists email text;
alter table public.consultor_portfolio_snapshots enable row level security;
revoke all on public.consultor_portfolio_snapshots from public,anon,authenticated;
grant select,insert,update on public.consultor_portfolio_snapshots to service_role;
create index if not exists consultor_snapshot_owner_email on public.consultor_portfolio_snapshots(owner,email) where email is not null;

-- Move the historical copies already held in notification state before removing that field.
lock table public.consultor_notifications in share row exclusive mode;
insert into public.consultor_portfolio_snapshots(owner,merchant_key,email,snapshot)
select n.owner, saved.key, coalesce(nullif(lower(trim(saved.value->'values'->((mail.position-1)::int)->>'stringValue')),''),
 case when saved.key like 'email:%' then substring(saved.key from 7) end), saved.value
from public.consultor_notifications n
cross join lateral jsonb_each(coalesce(n.state->'portfolioSnapshots','{}'::jsonb)) saved
left join lateral (
 select position from jsonb_array_elements_text(saved.value->'headers') with ordinality as h(header,position)
 where lower(trim(header)) in ('mail','email','e-mail','correo','correo electrónico','correo electronico') limit 1
) mail on true
on conflict(owner,merchant_key) do nothing;
update public.consultor_notifications set state=state-'portfolioSnapshots',revision=revision+1 where state?'portfolioSnapshots';

drop function if exists public.consultor_notification_indicator(text);

create or replace function public.consultor_save_notification_snapshots(target_owner text, records jsonb)
returns void language sql set search_path='' as $$
 insert into public.consultor_portfolio_snapshots as saved(owner,merchant_key,email,snapshot)
 select target_owner,incoming.merchant_key,nullif(incoming.email,''),incoming.snapshot
 from jsonb_to_recordset(records) as incoming(merchant_key text,email text,snapshot jsonb)
 on conflict(owner,merchant_key) do update set email=excluded.email,snapshot=excluded.snapshot
 where saved.snapshot->'headers' is distinct from excluded.snapshot->'headers'
 or not exists (
  select 1 from jsonb_array_elements(saved.snapshot->'values') with ordinality as old(value,position)
  where saved.snapshot->'linked'->((old.position-1)::int)='true'::jsonb
  and old.value not in ('null'::jsonb,'{"stringValue":""}'::jsonb)
  and coalesce(excluded.snapshot->'values'->((old.position-1)::int),'null'::jsonb)
      in ('null'::jsonb,'{"stringValue":""}'::jsonb)
 );
$$;
revoke all on function public.consultor_save_notification_snapshots(text,jsonb) from public,anon,authenticated;
grant execute on function public.consultor_save_notification_snapshots(text,jsonb) to service_role;

create or replace function public.consultor_sync_daily_schedule()
returns trigger language plpgsql security definer set search_path='' as $$
declare
 job_name text:='consultor-notify-'||md5(new.owner);
 version text:=new.state->>'scheduleVersion';
 configured_time text:=coalesce(new.state->>'time','09:00');
 local_zone text:='America/Argentina/Buenos_Aires';
 cron_zone text:=coalesce(nullif(current_setting('cron.timezone',true),''),'GMT');
 time_in_cron_zone timestamp;
 command text;
begin
 if tg_op='UPDATE' and old.state->'scheduleVersion' is not distinct from new.state->'scheduleVersion'
    and old.state->'enabled' is not distinct from new.state->'enabled'
    and old.state->'time' is not distinct from new.state->'time' then
  return new;
 end if;
 if new.state->'enabled' is distinct from 'true'::jsonb then
  if exists(select 1 from cron.job where jobname=job_name) then perform cron.unschedule(job_name); end if;
  return new;
 end if;
 if version is null or version !~ '^[a-f0-9]{32}$' or configured_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
  raise exception 'Invalid notification schedule';
 end if;
 time_in_cron_zone:=(((now() at time zone local_zone)::date+configured_time::time) at time zone local_zone) at time zone cron_zone;
 command:=format(
  'select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name=''NOTIFICATION_WORKER_URL''), headers := jsonb_build_object(''Content-Type'',''application/json'',''Authorization'',(select decrypted_secret from vault.decrypted_secrets where name=''NOTIFICATION_WORKER_AUTH'')), body := jsonb_build_object(''scheduleVersion'',%L), timeout_milliseconds := 90000)',
  version
 );
 perform cron.schedule(job_name,format('%s %s * * *',extract(minute from time_in_cron_zone)::int,extract(hour from time_in_cron_zone)::int),command);
 return new;
end;
$$;
revoke all on function public.consultor_sync_daily_schedule() from public,anon,authenticated;
drop trigger if exists consultor_sync_daily_schedule on public.consultor_notifications;
create trigger consultor_sync_daily_schedule after insert or update of state on public.consultor_notifications
for each row execute function public.consultor_sync_daily_schedule();

do $$
begin
 if exists(select 1 from cron.job where jobname='consultor-daily-notifications') then
  perform cron.unschedule('consultor-daily-notifications');
 end if;
end;
$$;
update public.consultor_notifications
set state=state||jsonb_build_object('scheduleVersion',md5(owner||clock_timestamp()::text||random()::text),'scheduleSince',now()),revision=revision+1
where state->'enabled'='true'::jsonb and not state?'scheduleVersion';
commit;
