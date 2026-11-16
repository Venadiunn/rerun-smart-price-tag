create table public.staff_invites(email text primary key);
alter table public.staff_invites enable row level security;
revoke all on public.staff_invites from public,anon,authenticated;
grant all on public.staff_invites to service_role;
create or replace function public.rerun_invitation_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
if not exists(select 1 from public.staff_invites where email=lower(new.email)) then raise exception 'ReRun is invitation-only. Ask your administrator for access.'; end if;
delete from public.staff_invites where email=lower(new.email);
return new;
end $$;
