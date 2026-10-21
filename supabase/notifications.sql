-- Run AFTER deploying /api/state and configuring its service-role credentials.
-- Back up the shared row first. No records or existing functions are deleted.
begin;
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
-- The Google session is checked by /api/state; it is not a Supabase Auth JWT.
revoke all on public.consultor_shared_state from anon,authenticated;
revoke execute on function public.consultor_save_demo(integer,jsonb) from public,anon,authenticated;
revoke execute on function public.consultor_update_details(integer,jsonb) from public,anon,authenticated;
grant select,update on public.consultor_shared_state to service_role;
grant execute on function public.consultor_save_demo(integer,jsonb) to service_role;
grant execute on function public.consultor_update_details(integer,jsonb) to service_role;
commit;
