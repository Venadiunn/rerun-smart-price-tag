alter table public.master_revisions
  add column catalog_base uuid references public.master_revisions(id),
  add column price_patch jsonb;

-- Revision metadata and price overrides can be read without fetching the catalog payload.
create function public.rerun_revision_assets(revision_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare rev public.master_revisions; base_number integer; base_path text; patches jsonb;
begin
  if public.rerun_role() is null then raise exception 'Staff access required'; end if;
  select * into rev from public.master_revisions where id=revision_id;
  if not found then raise exception 'Unknown master revision'; end if;
  if rev.catalog_base is null then
    base_path:=rev.storage_path;
    patches:='{}'::jsonb;
  else
    select revision,storage_path into base_number,base_path from public.master_revisions where id=rev.catalog_base;
    select coalesce(jsonb_object_agg(price_patch->>'productId',price_patch->'price' order by revision),'{}')
      into patches from public.master_revisions
      where catalog_base=rev.catalog_base and revision>base_number and revision<=rev.revision;
  end if;
  return jsonb_build_object(
    'baseId',coalesce(rev.catalog_base,rev.id),'path',base_path,'prices',patches,
    'previous',(select id from public.master_revisions where revision<rev.revision order by revision desc limit 1)
  );
end $$;
revoke all on function public.rerun_revision_assets(uuid) from public,anon;
grant execute on function public.rerun_revision_assets(uuid) to authenticated;

create function public.rerun_approve_price(price_request_id uuid, expected_revision uuid, request_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare old_id uuid; receipt jsonb; pr public.price_requests; product public.products;
  base_id uuid; next_id uuid:=gen_random_uuid(); next_number integer; ordinal integer; previous jsonb; candidate jsonb;
begin
  if coalesce(public.rerun_role(),'') not in ('manager','administrator') then raise exception 'Manager access required'; end if;
  if request_id is null then raise exception 'Request ID required'; end if;
  select active_revision into old_id from public.store_config for update;
  select result into receipt from public.command_requests where id=request_id and user_id=auth.uid();
  if found then
    if (receipt->>'priceRequestId')::uuid is distinct from price_request_id then raise exception 'Request ID already used'; end if;
    return (receipt->>'revisionId')::uuid;
  end if;
  if old_id is distinct from expected_revision then raise exception 'Master changed. Refresh and review again.'; end if;
  select * into pr from public.price_requests where id=price_request_id for update;
  if not found or pr.status<>'Pending' then raise exception 'Price request changed'; end if;
  select * into strict product from public.products where id=pr.product_id;
  if (product.data->>'cost')::integer>pr.price then raise exception 'Markdown is below cost floor'; end if;
  select payload,coalesce(catalog_base,id) into previous,base_id from public.master_revisions where id=old_id;
  select (i-1)::integer into ordinal from jsonb_array_elements(previous->'products') with ordinality as item(p,i)
  where p->>'id'=pr.product_id;
  if not found then raise exception 'Product is missing from the current master'; end if;
  candidate:=jsonb_set(previous,array['products',ordinal::text,'price'],to_jsonb(pr.price));
  select coalesce(max(revision),0)+1 into next_number from public.master_revisions;
  insert into public.master_revisions(id,revision,payload,storage_path,created_by,catalog_base,price_patch)
    values(next_id,next_number,candidate,auth.uid()::text||'/'||next_id::text||'.xlsx',auth.uid(),base_id,
    jsonb_build_object('productId',pr.product_id,'price',pr.price));
  update public.products set data=jsonb_set(data,'{price}',to_jsonb(pr.price)) where id=pr.product_id;
  update public.price_requests set status='Approved',version=version+1 where id=pr.id;
  update public.store_config set active_revision=next_id where id=true;
  insert into public.audit_events(action,entity_id,details,actor) values
    ('master_published',next_id::text,jsonb_build_object('revision',next_number,'previous',old_id,'priceRequest',pr.id),auth.uid());
  insert into public.command_requests(id,user_id,result) values(request_id,auth.uid(),
    jsonb_build_object('revisionId',next_id,'priceRequestId',pr.id));
  return next_id;
end $$;
revoke all on function public.rerun_approve_price(uuid,uuid,uuid) from public,anon;
grant execute on function public.rerun_approve_price(uuid,uuid,uuid) to authenticated;
alter function public.rerun_approve_price(uuid,uuid,uuid) set statement_timeout='30s';


create index if not exists rerun_tags_assigned_unit_idx on public.tags(unit_id) where unit_id is not null;
create function public.rerun_stock_snapshot(overview_only boolean) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r text; rev record; result jsonb;
begin
r:=public.rerun_role(); if r is null then raise exception 'Staff access required'; end if;
select m.id,m.revision,m.storage_path,m.created_at,m.created_by into rev from public.master_revisions m join public.store_config c on c.active_revision=m.id;
if overview_only then
  return jsonb_build_object(
    'profile',(select to_jsonb(p) from public.profiles p where p.id=auth.uid()),
    'revision',case when rev.id is null then null else to_jsonb(rev) end,
    'productCount',(select count(*) from public.products),
    'opening',(select coalesce(jsonb_object_agg(location_id,n),'{}') from (
      select location_id,sum(remaining) n from rerun_internal.opening_lots group by location_id) grouped),
    'master',jsonb_build_object(
      'products',(select coalesce(jsonb_agg(p.data),'[]') from public.products p
        where p.id in (select distinct product_id from public.units)),
      'locations',(select coalesce(jsonb_agg(data order by id),'[]') from public.locations),
      'categories','[]'::jsonb),
    'units',(select coalesce(jsonb_agg(u order by u.id),'[]') from public.units u),
    'tags',(select coalesce(jsonb_agg(t order by t.id),'[]') from public.tags t where t.unit_id is not null),
    'scans',(select coalesce(jsonb_agg(s order by s.created_at desc),'[]') from (
      select id,findings,acknowledged_at,created_at from public.scan_records) s),
    'events',(select coalesce(jsonb_agg(a order by a.created_at desc),'[]') from (
      select * from public.audit_events where r='administrator' or action not like 'staff_%'
      order by created_at desc limit 5) a)
  );
end if;
select jsonb_build_object(
'profile',(select to_jsonb(p) from public.profiles p where p.id=auth.uid()),
'profiles',case when r='administrator' then (select coalesce(jsonb_agg(p),'[]') from public.profiles p) else '[]'::jsonb end,
'reserveCount',(select count(*) from public.tags where id like 'TAG-RESERVE-%'),
'assets',case when rev.id is not null then public.rerun_revision_assets(rev.id) end,
'productCount',null,
'lotChanges',(select coalesce(jsonb_object_agg(product_id,remaining),'{}') from rerun_internal.opening_lots where remaining<>quantity),
'revision',case when rev.id is null then null else jsonb_build_object('id',rev.id,'revision',rev.revision,'storage_path',rev.storage_path,'created_at',rev.created_at,'created_by',rev.created_by,'price_only',(select catalog_base is not null from public.master_revisions where id=rev.id)) end,
'revisions',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'revision',revision,'storage_path',storage_path,'created_at',created_at,'created_by',created_by,'price_only',catalog_base is not null) order by revision desc),'[]') from public.master_revisions),
'units',(select coalesce(jsonb_agg(u order by u.id),'[]') from public.units u),
'tags',(select coalesce(jsonb_agg(t order by t.id),'[]') from public.tags t where id not like 'TAG-RESERVE-%' or version<>1 or status<>'Available'),
'scans',(select coalesce(jsonb_agg(s order by s.created_at desc),'[]') from public.scan_records s),
'events',(select coalesce(jsonb_agg(a order by a.created_at desc),'[]') from public.audit_events a where r='administrator' or a.action not like 'staff_%'),
'prices',(select coalesce(jsonb_agg(p order by p.created_at desc),'[]') from public.price_requests p),
'updates',(select coalesce(jsonb_agg(d order by d.created_at desc),'[]') from public.display_updates d),
'settings',(select settings from public.store_config)) into result;
return result;
end $$;

revoke all on function public.rerun_stock_snapshot(boolean) from public,anon;
grant execute on function public.rerun_stock_snapshot(boolean) to authenticated;
alter function public.rerun_stock_snapshot(boolean) set jit=off;
notify pgrst,'reload schema';
