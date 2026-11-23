create index opening_lots_changed_idx on rerun_internal.opening_lots(product_id) where remaining<>quantity;
create index tags_visible_idx on public.tags(id) where id not like 'TAG-RESERVE-%' or version<>1 or status<>'Available';
create function public.rerun_opening_manifest() returns text language plpgsql stable security definer set search_path='' as $$
begin
 if public.rerun_role() is null then raise exception 'Staff access required'; end if;
 return (select coalesce(string_agg(product_id||','||location_id||','||quantity,E'\n' order by product_id),'') from rerun_internal.opening_lots);
end $$;
revoke all on function public.rerun_opening_manifest() from public,anon;
grant execute on function public.rerun_opening_manifest() to authenticated;
update storage.buckets set allowed_mime_types=array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/gzip'] where id='master-workbooks';
create or replace function public.rerun_stock_snapshot() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r text; rev record; result jsonb;
begin
r:=public.rerun_role(); if r is null then raise exception 'Staff access required'; end if;
select m.id,m.revision,m.storage_path,m.created_at,m.created_by into rev from public.master_revisions m join public.store_config c on c.active_revision=m.id;
select jsonb_build_object(
'profile',(select to_jsonb(p) from public.profiles p where p.id=auth.uid()),
'profiles',case when r='administrator' then (select coalesce(jsonb_agg(p),'[]') from public.profiles p) else '[]'::jsonb end,
'reserveCount',(select count(*) from public.tags where id like 'TAG-RESERVE-%'),
'lotChanges',(select coalesce(jsonb_object_agg(product_id,remaining),'{}') from rerun_internal.opening_lots where remaining<>quantity),
'revision',case when rev.id is null then null else jsonb_build_object('id',rev.id,'revision',rev.revision,'storage_path',rev.storage_path,'created_at',rev.created_at,'created_by',rev.created_by) end,
'revisions',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'revision',revision,'storage_path',storage_path,'created_at',created_at,'created_by',created_by) order by revision desc),'[]') from public.master_revisions),
'units',(select coalesce(jsonb_agg(u order by u.id),'[]') from public.units u),
'tags',(select coalesce(jsonb_agg(t order by t.id),'[]') from public.tags t where id not like 'TAG-RESERVE-%' or version<>1 or status<>'Available'),
'scans',(select coalesce(jsonb_agg(s order by s.created_at desc),'[]') from public.scan_records s),
'events',(select coalesce(jsonb_agg(a order by a.created_at desc),'[]') from public.audit_events a where r='administrator' or a.action not like 'staff_%'),
'prices',(select coalesce(jsonb_agg(p order by p.created_at desc),'[]') from public.price_requests p),
'updates',(select coalesce(jsonb_agg(d order by d.created_at desc),'[]') from public.display_updates d),
'settings',(select settings from public.store_config)) into result;
return result;
end $$;

alter function public.rerun_stock_snapshot() set jit=off;
notify pgrst,'reload schema';
