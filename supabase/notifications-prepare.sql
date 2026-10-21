-- Additive preparation before deploying the authenticated bridge.
-- No change to existing client permissions. Snapshot stays inside Supabase.
begin;
create table if not exists public.consultor_notifications_backup_20261021 (
 id text primary key, snapshot jsonb not null, created_at timestamptz not null default now()
);
alter table public.consultor_notifications_backup_20261021 enable row level security;
revoke all on public.consultor_notifications_backup_20261021 from public,anon,authenticated;
grant select on public.consultor_notifications_backup_20261021 to service_role;
insert into public.consultor_notifications_backup_20261021(id,snapshot)
 select id,to_jsonb(s) from public.consultor_shared_state s where id='demo'
 on conflict(id) do nothing;
create table if not exists public.consultor_notifications (
 owner text primary key,
 revision bigint not null default 0,
 state jsonb not null default '{"enabled":false,"time":"09:00","jobs":{},"challenges":{}}'::jsonb,
 check (jsonb_typeof(state)='object'),
 check (octet_length(state::text)<8000000)
);
alter table public.consultor_notifications enable row level security;
revoke all on public.consultor_notifications from public,anon,authenticated;
grant all on public.consultor_notifications to service_role;
commit;
