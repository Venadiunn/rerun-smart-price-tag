-- The internal helper is callable only through the authenticated, serialized command API.
create schema if not exists rerun_internal;
revoke all on schema rerun_internal from public, anon, authenticated;

create or replace function rerun_internal.sort_received(unit_ids text[] default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  u public.units; home text; master_home text; cap integer; used integer; reason text;
  routed jsonb := '[]'; waiting jsonb := '[]'; revision uuid;
begin
  if public.rerun_role() is null then raise exception 'Staff access required'; end if;
  select active_revision into revision from public.store_config for update;
  -- Existing restock reservations and last confirmed placements consume space.
  -- Product ID, arrival time and permanent unit ID make batch order deterministic.
  for u in select * from public.units
    where status in ('Received in Store','Inspected')
      and (unit_ids is null or id=any(unit_ids))
    order by product_id collate "C",created_at,id for update
  loop
    select location_id into strict master_home from public.products where id=u.product_id;
    -- Only managers can change an existing unit's destination. Preserve that override.
    home:=case when u.destination_id<>master_home then u.destination_id else master_home end;
    select (data->>'capacity')::integer into cap from public.locations where id=home for update;
    select count(*) into used from public.units
      where id<>u.id and (current_location_id=home
        or (destination_id=home and status='Pending Restock'));
    reason:=null;
    if not u.inspected then reason:='Inspection required';
    elsif exists(select 1 from public.scan_records
      where product_id=u.product_id and (unit_id is null or unit_id=u.id)
      and findings<>array['VALID ITEM'] and acknowledged_at is null)
      then reason:='Scan discrepancy requires acknowledgement';
    elsif cap is not null and used>=cap then reason:='Destination full';
    end if;
    if reason is not null then
      waiting:=waiting||jsonb_build_array(jsonb_build_object(
        'unitId',u.id,'productId',u.product_id,'locationId',home,'reason',reason));
    else
      update public.units set destination_id=home,status='Pending Restock',version=version+1
        where id=u.id;
      routed:=routed||jsonb_build_array(jsonb_build_object(
        'unitId',u.id,'productId',u.product_id,'locationId',home));
      insert into public.audit_events(action,entity_id,actor,details)
        values('auto_sort_unit',u.id,auth.uid(),jsonb_build_object(
          'productId',u.product_id,'fromDestination',u.destination_id,
          'locationId',home,'masterLocation',master_home,'masterRevision',revision,'previousStatus',u.status));
    end if;
  end loop;
  return jsonb_build_object('ok',true,'sorted',jsonb_array_length(routed),
    'routes',routed,'waiting',waiting,'masterRevision',revision);
end $$;
revoke all on function rerun_internal.sort_received(text[]) from public,anon,authenticated;

create or replace function public.rerun_command(cmd text,args jsonb,request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare received_ids text[]:=array[]::text[]; r text; cfg public.store_config; u public.units; t public.tags; p public.products; d public.display_updates; pr public.price_requests; s public.scan_records; next_status text; loc text; cap integer; occupied integer; n integer; result jsonb; entity text; v jsonb; f text[]; ident text; raw text; full_payload boolean:=false;
begin
r:=public.rerun_role(); if r is null then raise exception 'Staff access required'; end if;
if request_id is null then raise exception 'Request ID required'; end if;
select * into cfg from public.store_config for update;
select cr.result into result from public.command_requests cr where cr.id=request_id and cr.user_id=auth.uid();
if found then return result; end if;
if exists(select 1 from public.command_requests where id=request_id) then raise exception 'Request ID belongs to another user'; end if;
entity:=coalesce(args->>'id','');
case cmd
when 'auto_sort' then
result:=rerun_internal.sort_received();
args:=args||jsonb_build_object('sorted',result->'sorted','waiting',result->'waiting');
when 'receive' then
select * into p from public.products where id=args->>'productId'; if not found then raise exception 'Unknown product'; end if;
n:=(args->>'quantity')::integer; if n is null or n<1 or n>100 then raise exception 'Receive between 1 and 100 units at once'; end if;
for i in 1..n loop
next_status:=coalesce(args->>'status','Received in Store');
if next_status not in ('Offered','In-Transit','Received in Store') then raise exception 'Invalid initial lifecycle status'; end if;
insert into public.units(product_id,status,destination_id) values(p.id,next_status,p.location_id) returning * into u;
received_ids:=array_append(received_ids,u.id);
insert into public.audit_events(action,entity_id,actor,details) values(next_status,u.id,auth.uid(),jsonb_build_object('productId',p.id));
end loop; entity:=p.id;
if next_status='Received in Store' and coalesce((args->>'autoSort')::boolean,true) then
result:=rerun_internal.sort_received(received_ids)||jsonb_build_object('id',p.id,'unitIds',to_jsonb(received_ids));
else result:=jsonb_build_object('ok',true,'id',p.id,'unitIds',to_jsonb(received_ids)); end if;
when 'transition' then
select * into u from public.units where id=entity for update; if not found then raise exception 'Unknown unit'; end if;
if u.version is distinct from (args->>'version')::integer then raise exception 'This unit changed. Refresh and retry.'; end if;
next_status:=args->>'status';
if not (case u.status
when 'Offered' then next_status='In-Transit'
when 'In-Transit' then next_status='Received in Store'
when 'Received in Store' then next_status in ('Pending Restock','Stocked Out')
when 'Pending Restock' then next_status in ('Restocked','Stocked Out')
when 'Restocked' then next_status in ('Pending Restock','Scanned at Register','Stocked Out')
when 'Scanned at Register' then next_status in ('Sold','Pending Restock')
when 'Sold' then next_status='Returned'
when 'Returned' then next_status='Inspected'
when 'Inspected' then next_status in ('Pending Restock','Stocked Out') else false end) then raise exception 'Invalid lifecycle transition: % to %',u.status,next_status; end if;
if next_status='Stocked Out' and length(trim(coalesce(args->>'reason','')))<3 then raise exception 'Stock-out reason required'; end if;
if next_status='Restocked' then
if not u.inspected then raise exception 'Inspect returned merchandise first'; end if;
if exists(select 1 from public.scan_records where product_id=u.product_id and (unit_id is null or unit_id=u.id) and findings<>array['VALID ITEM'] and acknowledged_at is null) then raise exception 'Acknowledge the outstanding scan discrepancies first'; end if;
loc:=u.destination_id;
select (data->>'capacity')::integer into cap from public.locations where id=loc for update;
select count(*) into occupied from public.units where current_location_id=loc and id<>u.id;
if cap is not null and occupied>=cap then raise exception 'Destination is full. Ask a manager to assign overflow.'; end if;
else loc:=null; end if;
update public.units set status=next_status,current_location_id=loc,version=version+1,inspected=case when next_status='Returned' then false when next_status='Inspected' then true else inspected end where id=u.id;
if next_status in ('Received in Store','Inspected') then
result:=rerun_internal.sort_received(array[u.id])||jsonb_build_object('id',u.id); end if;
when 'destination' then
if r='associate' then raise exception 'Manager access required'; end if;
select * into u from public.units where id=entity for update;
if not found or u.version is distinct from (args->>'version')::integer then raise exception 'Unit changed or missing'; end if;
if length(trim(coalesce(args->>'reason','')))<3 then raise exception 'Destination change reason required'; end if;
if not exists(select 1 from public.locations where id=args->>'locationId') then raise exception 'Unknown location'; end if;
select (data->>'capacity')::integer into cap from public.locations where id=args->>'locationId' for update;
select count(*) into occupied from public.units where current_location_id=args->>'locationId' and id<>u.id;
if cap is not null and occupied>=cap then raise exception 'Overflow destination is full'; end if;
update public.units set destination_id=args->>'locationId',version=version+1,status=case when status='Restocked' and destination_id<>args->>'locationId' then 'Pending Restock' else status end where id=entity;
when 'tag_register' then
if r='associate' then raise exception 'Manager access required'; end if;
if entity !~ '^TAG-[A-Za-z0-9-]{1,80}$' then raise exception 'Use TAG- followed by letters, numbers or hyphens'; end if;
insert into public.tags(id) values(entity);
when 'tag_action' then
select * into t from public.tags where id=entity for update;
if not found or t.version is distinct from (args->>'version')::integer then raise exception 'Tag changed or missing'; end if;
next_status:=args->>'action';
if next_status='assign' then
if t.status<>'Available' then raise exception 'Tag must be available'; end if;
select * into u from public.units where id=args->>'unitId' for update;
if not found or u.status in ('Sold','Stocked Out','Returned') then raise exception 'Select an eligible active unit'; end if;
if exists(select 1 from public.tags where unit_id=u.id) then raise exception 'This unit already has a tag'; end if;
update public.tags set status='Assigned',unit_id=u.id,version=version+1 where id=t.id;
elsif next_status='recover' then
if t.status<>'Assigned' then raise exception 'Tag is not assigned'; end if;
update public.tags set status='Inspection',unit_id=null,version=version+1 where id=t.id;
elsif next_status='inspect' then
if t.status<>'Inspection' then raise exception 'Tag is not awaiting inspection'; end if;
update public.tags set status='Available',version=version+1 where id=t.id;
elsif next_status='retire' and r<>'associate' then
if t.status='Assigned' then raise exception 'Recover the tag before retiring it'; end if;
update public.tags set status='Retired',version=version+1 where id=t.id;
else raise exception 'Invalid tag action'; end if;
args:=args||jsonb_build_object('previousUnitId',t.unit_id);
when 'scan' then
raw:=trim(args->>'raw'); if raw is null or length(raw)=0 or length(raw)>32768 then raise exception 'Invalid scan payload size'; end if;
if left(raw,1)='{' then
v:=raw::jsonb; full_payload:=true;
if jsonb_typeof(v->'Item_ID')<>'string' or length(v->>'Item_ID')=0 then raise exception 'QR requires Item_ID'; end if;
ident:=coalesce(v->>'Unit_ID',v->>'Item_ID');
else v:=to_jsonb(raw); ident:=regexp_replace(raw,'^rerun:(unit|tag):',''); end if;
select * into t from public.tags where id=ident;
if found then
if t.unit_id is null then f:=array['UNASSIGNED TAG']; else ident:=t.unit_id; end if;
end if;
if f is null then
select * into u from public.units where id=ident;
select * into p from public.products where id=coalesce(u.product_id,ident) or data->>'sku'=ident or (data->>'barcode'<>'' and data->>'barcode'=ident);
if not found then f:=array['UNKNOWN ITEM'];
else
f:=array[]::text[];
if full_payload then
if v->>'Item_ID'<>p.id then raise exception 'Item_ID and Unit_ID disagree'; end if;
if v->>'Item_Name' is distinct from p.data->>'name' then f:=array_append(f,'ITEM NAME MISMATCH'); end if;
if jsonb_typeof(v->'Price') is distinct from 'number' then f:=array_append(f,'PRICE MISMATCH');
elsif (v->>'Price')::numeric*100<>(p.data->>'price')::numeric then f:=array_append(f,'PRICE MISMATCH'); end if;
if coalesce(v->>'Intended_Location','')='' then f:=array_append(f,'MISSING LOCATION');
elsif v->>'Intended_Location'<>p.location_id then f:=array_append(f,'LOCATION MISMATCH'); end if;
end if;
if cardinality(f)=0 then f:=array['VALID ITEM']; end if;
end if; end if;
insert into public.scan_records(raw,findings,product_id,unit_id,master_revision) values(v,f,p.id,u.id,cfg.active_revision) returning * into s;
result:=to_jsonb(s); entity:=s.id::text;
when 'acknowledge' then
update public.scan_records set acknowledged_at=now() where id=entity::uuid and product_id is not null returning * into s;
if not found then raise exception 'Only recognized scans can be acknowledged'; end if;
when 'price_request' then
select * into p from public.products where id=args->>'productId'; if not found then raise exception 'Unknown product'; end if;
n:=(args->>'price')::integer;
if n<0 or length(trim(coalesce(args->>'reason','')))<3 then raise exception 'Nonnegative price and reason required'; end if;
insert into public.price_requests(product_id,price,reason) values(p.id,n,args->>'reason') returning * into pr; entity:=pr.id::text;
when 'price_reject' then
if r='associate' then raise exception 'Manager access required'; end if;
update public.price_requests set status='Rejected',version=version+1 where id=entity::uuid and status='Pending' and version=(args->>'version')::integer;
if not found then raise exception 'Request changed or missing'; end if;
when 'display_create' then
select * into t from public.tags where id=entity;
if not found or t.unit_id is null then raise exception 'Assign this tag first'; end if;
select * into u from public.units where id=t.unit_id;
select * into p from public.products where id=u.product_id;
insert into public.display_updates(tag_id,unit_id,requested) values(t.id,u.id,p.data||jsonb_build_object('locationId',u.destination_id,'masterRevision',cfg.active_revision,'simulated',true)) returning * into d;
entity:=d.id::text;
when 'display_action' then
select * into d from public.display_updates where id=entity::uuid for update;
if not found or d.version is distinct from (args->>'version')::integer then raise exception 'Update changed or missing'; end if;
next_status:=args->>'status';
if not ((d.status='Pending' and next_status in ('Written','Failed')) or (d.status='Written' and next_status in ('Verified','Failed')) or (d.status='Failed' and next_status='Pending')) then raise exception 'Invalid display update transition'; end if;
if not exists(select 1 from public.tags where id=d.tag_id and unit_id=d.unit_id and status='Assigned') then raise exception 'Tag assignment changed; prepare a new update'; end if;
if next_status='Verified' then
select p1.* into p from public.products p1 join public.units u1 on p1.id=u1.product_id where u1.id=d.unit_id;
if d.requested->>'masterRevision'<>cfg.active_revision::text or d.requested->>'locationId'<>(select destination_id from public.units where id=d.unit_id) then raise exception 'Master or destination changed; prepare a new update'; end if;
end if;
update public.display_updates set status=next_status,version=version+1,attempt=attempt+case when next_status='Pending' then 1 else 0 end where id=d.id;
when 'settings' then
if r='associate' then raise exception 'Manager access required'; end if;
if not(args ?& array['ageDays','sellThrough','discount']) or args->>'ageDays' is null or args->>'sellThrough' is null or args->>'discount' is null then raise exception 'Invalid markdown thresholds'; end if;
if (args->>'ageDays')::integer<1 or (args->>'ageDays')::integer>3650 or (args->>'sellThrough')::numeric<0 or (args->>'sellThrough')::numeric>100 or (args->>'discount')::numeric<=0 or (args->>'discount')::numeric>90 then raise exception 'Invalid markdown thresholds'; end if;
update public.store_config set settings=args where id=true;
when 'staff_update' then
if r<>'administrator' then raise exception 'Administrator access required'; end if;
if entity=auth.uid()::text then raise exception 'You cannot change your own access'; end if;
update public.profiles set role=args->>'role',active=(args->>'active')::boolean where id=entity::uuid;
if not found then raise exception 'Unknown employee'; end if;
else raise exception 'Unknown command';
end case;
if result is null then result:=jsonb_build_object('ok',true,'id',entity); end if;
insert into public.audit_events(action,entity_id,details,actor) values(cmd,entity,args,auth.uid());
insert into public.command_requests(id,user_id,result) values(request_id,auth.uid(),result);
return result;
end $$;
revoke all on function public.rerun_command(text,jsonb,uuid) from public,anon;
grant execute on function public.rerun_command(text,jsonb,uuid) to authenticated;


