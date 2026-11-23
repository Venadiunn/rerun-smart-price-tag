-- Opening lots encode individually addressable units and their assigned smart tags.
create table rerun_internal.opening_lots(
 product_id text primary key references public.products(id),
 location_id text not null references public.locations(id),
 quantity integer not null check(quantity between 1 and 100),
 remaining integer not null check(remaining between 0 and quantity)
);
create index opening_lots_location on rerun_internal.opening_lots(location_id);
revoke all on rerun_internal.opening_lots from public,anon,authenticated;
create function rerun_internal.remaining_at(loc text) returns integer language sql stable set search_path='' as $$
 select coalesce(sum(remaining),0)::integer from rerun_internal.opening_lots where location_id=loc
$$;
revoke all on function rerun_internal.remaining_at(text) from public,anon,authenticated;
-- All stock writes share the command transaction lock. Materialization transfers one unit,
-- and its paired tag, from the lot into normal lifecycle records without changing occupancy.
create function rerun_internal.open_unit(code text) returns text language plpgsql set search_path='' as $$
declare parts text[]; lot rerun_internal.opening_lots; uid text; tid text;
begin
 parts:=regexp_match(code,'^(?:UNIT|TAG)-(GR-[0-9]{6})-([1-9][0-9]?)$');
 if parts is null then return null; end if;
 select * into lot from rerun_internal.opening_lots where product_id=parts[1] for update;
 if not found or parts[2]::int>lot.quantity then return null; end if;
 uid:='UNIT-'||parts[1]||'-'||parts[2]; tid:='TAG-'||parts[1]||'-'||parts[2];
 if exists(select from public.units where id=uid) then return uid; end if;
 insert into public.units(id,product_id,status,current_location_id,destination_id)
 values(uid,lot.product_id,'Restocked',lot.location_id,lot.location_id);
 insert into public.tags(id,unit_id,status) values(tid,uid,'Assigned');
 update rerun_internal.opening_lots set remaining=remaining-1 where product_id=lot.product_id;
 return uid;
end $$;
revoke all on function rerun_internal.open_unit(text) from public,anon,authenticated;
update storage.buckets set file_size_limit=16777216 where id='master-workbooks';

create or replace function public.rerun_publish_master(candidate jsonb,expected_revision uuid,workbook_path text,request_id uuid,price_request_id uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare valid_locations text[]; valid_categories text[]; cfg public.store_config; r text; v jsonb; new_id uuid:=gen_random_uuid(); rev integer; old_result jsonb; pr public.price_requests;
begin
r:=public.rerun_role(); if r not in ('manager','administrator') or r is null then raise exception 'Manager access required'; end if;
select * into cfg from public.store_config for update;
select result into old_result from public.command_requests where id=request_id and user_id=auth.uid();
if found then return (old_result->>'revisionId')::uuid; end if;
if request_id is null then raise exception 'Request ID required'; end if;
if cfg.active_revision is distinct from expected_revision then raise exception 'Master changed. Download the latest revision and review again.'; end if;
if not exists(select 1 from storage.objects where bucket_id='master-workbooks' and name=workbook_path and owner_id=auth.uid()::text) then raise exception 'Upload the master workbook before publication'; end if;
new_id:=replace(split_part(workbook_path,'/',2),'.xlsx','')::uuid;
if jsonb_typeof(candidate->'products')<>'array' or jsonb_array_length(candidate->'products') not between 1 and 50000 or jsonb_typeof(candidate->'locations')<>'array' or jsonb_array_length(candidate->'locations') not between 1 and 1000 or jsonb_typeof(candidate->'categories')<>'array' or jsonb_array_length(candidate->'categories') not between 1 and 1000 then raise exception 'Invalid master structure'; end if;
foreach r in array array['products','locations','categories'] loop
if exists(select 1 from jsonb_array_elements(candidate->r) x where jsonb_typeof(x->'id') is distinct from 'string' or length(x->>'id') not between 1 and 120) then raise exception 'Invalid master identifier'; end if;
if (select count(*) from jsonb_array_elements(candidate->r))<>(select count(distinct x->>'id') from jsonb_array_elements(candidate->r) x) then raise exception 'Duplicate master identifier'; end if;
end loop;
for v in select * from jsonb_array_elements(candidate->'locations') loop
if length(coalesce(v->>'department',''))=0 or length(coalesce(v->>'aisle',''))=0 then raise exception 'Location department and aisle required'; end if;
if v->>'capacity' is not null and ((v->>'capacity')::numeric<>trunc((v->>'capacity')::numeric) or (v->>'capacity')::integer<1) then raise exception 'Invalid capacity'; end if;
end loop;
if exists (
  with homes as materialized (select x->>'id' id,x->>'locationId' home from jsonb_array_elements(candidate->'products') x),
  commitments as (
    select current_location_id loc,count(*) n from public.units where current_location_id is not null group by 1
    union all
    select case when u.destination_id=p.location_id then h.home else u.destination_id end,count(*)
    from public.units u join public.products p on p.id=u.product_id join homes h on h.id=p.id
    where (u.status='Pending Restock' or (u.status='Restocked' and u.destination_id=p.location_id and h.home<>p.location_id))
    and (case when u.destination_id=p.location_id then h.home else u.destination_id end) is distinct from u.current_location_id group by 1
    union all select location_id,sum(remaining) from rerun_internal.opening_lots group by 1)
  select 1 from jsonb_array_elements(candidate->'locations') l join commitments c on c.loc=l->>'id'
  group by l having (l->>'capacity')::integer < sum(c.n)
) then raise exception 'Capacity is below confirmed placements and restock reservations'; end if;
select array_agg(x->>'id') into valid_locations from jsonb_array_elements(candidate->'locations') x;
select array_agg(x->>'id') into valid_categories from jsonb_array_elements(candidate->'categories') x;
for v in select * from jsonb_array_elements(candidate->'products') loop
if length(coalesce(v->>'name',''))=0 or length(coalesce(v->>'sku',''))=0 or jsonb_typeof(v->'price') is distinct from 'number' or (v->>'price')::numeric<>trunc((v->>'price')::numeric) or (v->>'price')::numeric not between 0 and 2147483647 then raise exception 'Invalid product name, SKU or price'; end if;
if v->>'cost' is not null and ((v->>'cost')::numeric<>trunc((v->>'cost')::numeric) or (v->>'cost')::numeric not between 0 and 2147483647) then raise exception 'Invalid cost'; end if;
if v->>'cost' is not null and (v->>'price')::integer<(v->>'cost')::integer and exists(select 1 from public.products p where p.id=v->>'id' and (p.data->>'price')::integer>(v->>'price')::integer) then raise exception 'Markdown is below cost floor'; end if;
if not ((v->>'locationId')=any(valid_locations)) or not ((v->>'categoryId')=any(valid_categories)) then raise exception 'Unknown category or location for %',v->>'id'; end if;
end loop;
if exists(select 1 from (select p->>'id' id,unnest(array[p->>'sku',nullif(p->>'barcode','')]) alias from jsonb_array_elements(candidate->'products') p) a where a.alias is not null group by a.alias having count(distinct id)>1) then raise exception 'Duplicate product alias'; end if;
if exists(select 1 from jsonb_array_elements(candidate->'products') p
 cross join lateral unnest(array[p->>'id',p->>'sku',nullif(p->>'barcode','')]) a
 where a is not null group by a having count(distinct p->>'id')>1) then raise exception 'Ambiguous product alias'; end if;
if price_request_id is not null then
select * into pr from public.price_requests where id=price_request_id for update;
if not found or pr.status<>'Pending' then raise exception 'Price request changed'; end if;
if not exists(select 1 from jsonb_array_elements(candidate->'products') p where p->>'id'=pr.product_id and (p->>'price')::integer=pr.price) then raise exception 'Candidate does not apply the requested price'; end if;
if exists(select 1 from jsonb_array_elements(candidate->'products') p where p->>'id'=pr.product_id and p->>'cost' is not null and (p->>'cost')::integer>pr.price) then raise exception 'Markdown is below cost floor'; end if;
end if;
select coalesce(max(revision),0)+1 into rev from public.master_revisions;
insert into public.master_revisions(id,revision,payload,storage_path,created_by) values(new_id,rev,candidate,workbook_path,auth.uid());
insert into public.categories select x->>'id',x from jsonb_array_elements(candidate->'categories') x on conflict(id) do update set data=excluded.data;
insert into public.locations select x->>'id',x from jsonb_array_elements(candidate->'locations') x on conflict(id) do update set data=excluded.data;
-- Follow changed home locations unless a manager explicitly assigned a unit elsewhere.
insert into public.audit_events(action,entity_id,details,actor) select 'Destination changed',u.id,jsonb_build_object('previous',u.destination_id,'next',x->>'locationId','revision',new_id),auth.uid() from public.units u,public.products p,jsonb_array_elements(candidate->'products') x where p.id=u.product_id and x->>'id'=p.id and u.destination_id=p.location_id and p.location_id<>x->>'locationId';
update public.units u set destination_id=x->>'locationId',version=u.version+1,status=case when u.status='Restocked' then 'Pending Restock' else u.status end from public.products p,jsonb_array_elements(candidate->'products') x where p.id=u.product_id and x->>'id'=p.id and u.destination_id=p.location_id and p.location_id<>x->>'locationId';
insert into public.products select x->>'id',x->>'locationId',x->>'categoryId',x from jsonb_array_elements(candidate->'products') x on conflict(id) do update set location_id=excluded.location_id,category_id=excluded.category_id,data=excluded.data;
with incoming as materialized (select x->>'id' id from jsonb_array_elements(candidate->'products') x) delete from public.products p where not exists(select from incoming i where i.id=p.id);
delete from public.locations where id not in(select x->>'id' from jsonb_array_elements(candidate->'locations') x);
delete from public.categories where id not in(select x->>'id' from jsonb_array_elements(candidate->'categories') x);
update public.store_config set active_revision=new_id where id=true;
if price_request_id is not null then update public.price_requests set status='Approved',version=version+1 where id=price_request_id; end if;
insert into public.audit_events(action,entity_id,details,actor) values('master_published',new_id::text,jsonb_build_object('revision',rev,'previous',expected_revision,'priceRequest',price_request_id),auth.uid());
insert into public.command_requests(id,user_id,result) values(request_id,auth.uid(),jsonb_build_object('revisionId',new_id));
return new_id;
end $$;
revoke all on function public.rerun_publish_master(jsonb,uuid,text,uuid,uuid) from public,anon;
grant execute on function public.rerun_publish_master(jsonb,uuid,text,uuid,uuid) to authenticated;


create or replace function public.rerun_stock_snapshot() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r text; rev public.master_revisions; result jsonb;
begin
r:=public.rerun_role(); if r is null then raise exception 'Staff access required'; end if;
select m.* into rev from public.master_revisions m join public.store_config c on c.active_revision=m.id;
select jsonb_build_object(
'profile',(select to_jsonb(p) from public.profiles p where p.id=auth.uid()),
'profiles',case when r='administrator' then (select coalesce(jsonb_agg(p),'[]') from public.profiles p) else '[]'::jsonb end,
'lots',(select coalesce(jsonb_agg(jsonb_build_array(product_id,location_id,quantity,remaining) order by product_id),'[]') from rerun_internal.opening_lots),
'revision',case when rev.id is null then null else jsonb_build_object('id',rev.id,'revision',rev.revision,'storage_path',rev.storage_path,'created_at',rev.created_at,'created_by',rev.created_by) end,
'revisions',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'revision',revision,'storage_path',storage_path,'created_at',created_at,'created_by',created_by) order by revision desc),'[]') from public.master_revisions),
'units',(select coalesce(jsonb_agg(u order by u.id),'[]') from public.units u),
'tags',(select coalesce(jsonb_agg(t order by t.id),'[]') from public.tags t),
'scans',(select coalesce(jsonb_agg(s order by s.created_at desc),'[]') from public.scan_records s),
'events',(select coalesce(jsonb_agg(a order by a.created_at desc),'[]') from public.audit_events a where r='administrator' or a.action not like 'staff_%'),
'prices',(select coalesce(jsonb_agg(p order by p.created_at desc),'[]') from public.price_requests p),
'updates',(select coalesce(jsonb_agg(d order by d.created_at desc),'[]') from public.display_updates d),
'settings',(select settings from public.store_config)) into result;
return result;
end $$;
revoke all on function public.rerun_stock_snapshot() from public,anon;
grant execute on function public.rerun_stock_snapshot() to authenticated;

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
when 'open_unit' then
if rerun_internal.open_unit(entity) is null then raise exception 'Unknown opening unit'; end if;
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
if next_status='Pending Restock' then
select (data->>'capacity')::integer-rerun_internal.remaining_at(id) into cap from public.locations where id=u.destination_id for update;
select count(*) into occupied from public.units where id<>u.id and (current_location_id=u.destination_id or (destination_id=u.destination_id and status='Pending Restock'));
if cap is not null and occupied>=cap then raise exception 'Destination is full or reserved. Ask a manager to assign overflow.'; end if;
end if;
if next_status='Restocked' then
if not u.inspected then raise exception 'Inspect returned merchandise first'; end if;
if exists(select 1 from public.scan_records where product_id=u.product_id and (unit_id is null or unit_id=u.id) and findings<>array['VALID ITEM'] and acknowledged_at is null) then raise exception 'Acknowledge the outstanding scan discrepancies first'; end if;
loc:=u.destination_id;
select (data->>'capacity')::integer-rerun_internal.remaining_at(id) into cap from public.locations where id=loc for update;
select count(*) into occupied from public.units where id<>u.id and (current_location_id=loc or (destination_id=loc and status='Pending Restock'));
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
select (data->>'capacity')::integer-rerun_internal.remaining_at(id) into cap from public.locations where id=args->>'locationId' for update;
select count(*) into occupied from public.units where id<>u.id and (current_location_id=args->>'locationId' or (destination_id=args->>'locationId' and status='Pending Restock'));
if cap is not null and occupied>=cap then raise exception 'Overflow destination is full'; end if;
update public.units set destination_id=args->>'locationId',version=version+1,status=case when status='Restocked' and destination_id<>args->>'locationId' then 'Pending Restock' else status end where id=entity;
when 'tag_register' then
if r='associate' then raise exception 'Manager access required'; end if;
if entity like 'TAG-GR-%' then raise exception 'Reserved opening-stock identifier'; end if;
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
perform rerun_internal.open_unit(ident);
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
if cmd in ('receive','auto_sort','transition','destination') then
  result:=coalesce(result,jsonb_build_object('ok',true,'id',entity))||jsonb_build_object('tagging',rerun_internal.ensure_smart_tags());
end if;
if result is null then result:=jsonb_build_object('ok',true,'id',entity); end if;
insert into public.audit_events(action,entity_id,details,actor) values(cmd,entity,args,auth.uid());
insert into public.command_requests(id,user_id,result) values(request_id,auth.uid(),result);
return result;
end $$;
revoke all on function public.rerun_command(text,jsonb,uuid) from public,anon;
grant execute on function public.rerun_command(text,jsonb,uuid) to authenticated;

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
    select (data->>'capacity')::integer-rerun_internal.remaining_at(id) into cap from public.locations where id=home for update;
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



-- Publish the workbook, seed its opening inventory and match vacant slots in one transaction.
create function public.rerun_seed_grocery(candidate jsonb, expected_revision uuid, workbook_path text, request_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare revision_id uuid; vacancies integer;
begin
 if public.rerun_role() is distinct from 'administrator' then raise exception 'Administrator required'; end if;
 perform 1 from public.store_config for update;
 if exists(select from rerun_internal.opening_lots) then raise exception 'Opening inventory already initialized'; end if;
 revision_id:=public.rerun_publish_master(candidate,expected_revision,workbook_path,request_id,null);
 insert into rerun_internal.opening_lots(product_id,location_id,quantity,remaining)
 select id,location_id,q,q from public.products
 cross join lateral (select substr(id,4,1)::int d,substr(id,5)::int-1 i) idx
 cross join lateral (select (array[18,10,25,20,15,15,15])[d]+i%(array[15,11,21,16,11,16,16])[d] q) qty
 where id ~ '^GR-[1-7][0-9]{5}$';
 select sum((data->>'capacity')::integer)-(select sum(quantity) from rerun_internal.opening_lots)-(select count(*) from public.tags) into vacancies from public.locations;
 if vacancies<0 then raise exception 'Opening stock exceeds capacity'; end if;
 insert into public.tags(id) select 'TAG-RESERVE-'||lpad(i::text,5,'0') from generate_series(1,vacancies) i;
 return revision_id;
end $$;
revoke all on function public.rerun_seed_grocery(jsonb,uuid,text,uuid) from public,anon;
grant execute on function public.rerun_seed_grocery(jsonb,uuid,text,uuid) to authenticated;
