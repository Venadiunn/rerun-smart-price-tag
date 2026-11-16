create function public.rerun_invitation_guard() returns trigger language plpgsql set search_path='' as $$
begin
if coalesce(new.raw_app_meta_data->>'rerun_invited','false')<>'true' then raise exception 'ReRun is invitation-only. Ask your administrator for access.'; end if;
return new;
end $$;
revoke all on function public.rerun_invitation_guard() from public,anon,authenticated;
create trigger rerun_invitation_guard before insert on auth.users for each row execute function public.rerun_invitation_guard();
