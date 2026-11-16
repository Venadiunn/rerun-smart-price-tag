-- ReRun: single-store transactional inventory. All browser writes go through checked RPCs.
create table public.profiles(id uuid primary key references auth.users(id), email text not null, role text not null check(role in ('associate','manager','administrator')), active boolean not null default true);
create table public.master_revisions(id uuid primary key default gen_random_uuid(), revision integer unique not null, payload jsonb not null, storage_path text not null, created_by uuid references public.profiles(id), created_at timestamptz not null default now());
create table public.store_config(id boolean primary key default true check(id), active_revision uuid references public.master_revisions(id), settings jsonb not null default '{"ageDays":30,"sellThrough":20,"discount":10}');
insert into public.store_config(id) values(true);
create table public.categories(id text primary key, data jsonb not null);
create table public.locations(id text primary key, data jsonb not null);
create table public.products(id text primary key, location_id text not null references public.locations(id), category_id text not null references public.categories(id), data jsonb not null);
create table public.units(id text primary key default ('UNIT-'||upper(replace(gen_random_uuid()::text,'-',''))), product_id text not null references public.products(id), status text not null check(status in ('Offered','In-Transit','Received in Store','Scanned at Register','Sold','Returned','Inspected','Pending Restock','Restocked','Stocked Out')), current_location_id text references public.locations(id), destination_id text not null references public.locations(id), inspected boolean not null default true, version integer not null default 1, created_at timestamptz not null default now());
create index units_product_idx on public.units(product_id);
create index units_location_idx on public.units(current_location_id);
create table public.tags(id text primary key, unit_id text unique references public.units(id), status text not null default 'Available' check(status in ('Available','Assigned','Inspection','Retired')), version integer not null default 1, check((status='Assigned')=(unit_id is not null)));
create table public.audit_events(id uuid primary key default gen_random_uuid(), action text not null, entity_id text not null, details jsonb not null default '{}', actor uuid references public.profiles(id), created_at timestamptz not null default now());
create index audit_created_idx on public.audit_events(created_at desc);
create table public.scan_records(id uuid primary key default gen_random_uuid(), raw jsonb not null, findings text[] not null, product_id text references public.products(id), unit_id text references public.units(id), master_revision uuid not null references public.master_revisions(id), acknowledged_at timestamptz, created_at timestamptz not null default now());
create table public.price_requests(id uuid primary key default gen_random_uuid(), product_id text not null references public.products(id), price integer not null check(price>=0), reason text not null, status text not null default 'Pending' check(status in ('Pending','Approved','Rejected')), version integer not null default 1, created_at timestamptz not null default now());
create table public.display_updates(id uuid primary key default gen_random_uuid(), tag_id text not null references public.tags(id), unit_id text not null references public.units(id), requested jsonb not null, status text not null default 'Pending' check(status in ('Pending','Written','Verified','Failed')), version integer not null default 1, attempt integer not null default 1, created_at timestamptz not null default now());
create table public.command_requests(id uuid primary key, user_id uuid not null references public.profiles(id), result jsonb not null, created_at timestamptz not null default now());

create function public.rerun_role() returns text language sql stable security definer set search_path='' as $$ select role from public.profiles where id=auth.uid() and active $$;
revoke all on function public.rerun_role() from public,anon;
grant execute on function public.rerun_role() to authenticated;
do $$ declare t text; begin
foreach t in array array['profiles','master_revisions','store_config','categories','locations','products','units','tags','audit_events','scan_records','price_requests','display_updates','command_requests'] loop
execute format('alter table public.%I enable row level security',t);
execute format('revoke all on public.%I from anon,authenticated',t);
if t not in ('command_requests','profiles') then
execute format('grant select on public.%I to authenticated',t);
execute format('create policy staff_read on public.%I for select to authenticated using ((select public.rerun_role()) is not null)',t);
end if;
end loop;
end $$;
grant select on public.profiles to authenticated;
create policy profiles_read on public.profiles for select to authenticated using (id=auth.uid() or (select public.rerun_role())='administrator');

create function public.rerun_snapshot() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r text; rev public.master_revisions; result jsonb;
begin
r:=public.rerun_role(); if r is null then raise exception 'Staff access required'; end if;
select m.* into rev from public.master_revisions m join public.store_config c on c.active_revision=m.id;
select jsonb_build_object(
'profile',(select to_jsonb(p) from public.profiles p where p.id=auth.uid()),
'profiles',case when r='administrator' then (select coalesce(jsonb_agg(p),'[]') from public.profiles p) else '[]'::jsonb end,
'master',coalesce(rev.payload,'{"products":[],"locations":[],"categories":[]}'),
'revision',case when rev.id is null then null else to_jsonb(rev) end,
'revisions',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'revision',revision,'storage_path',storage_path,'created_at',created_at,'created_by',created_by) order by revision desc),'[]') from public.master_revisions),
'units',(select coalesce(jsonb_agg(u order by u.id),'[]') from public.units u),
'tags',(select coalesce(jsonb_agg(t order by t.id),'[]') from public.tags t),
'scans',(select coalesce(jsonb_agg(s order by s.created_at desc),'[]') from public.scan_records s),
'events',(select coalesce(jsonb_agg(a order by a.created_at desc),'[]') from public.audit_events a),
'prices',(select coalesce(jsonb_agg(p order by p.created_at desc),'[]') from public.price_requests p),
'updates',(select coalesce(jsonb_agg(d order by d.created_at desc),'[]') from public.display_updates d),
'settings',(select settings from public.store_config)) into result;
return result;
end $$;
revoke all on function public.rerun_snapshot() from public,anon;
grant execute on function public.rerun_snapshot() to authenticated;

create function public.rerun_command(cmd text,args jsonb,request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r text; cfg public.store_config; u public.units; t public.tags; p public.products; d public.display_updates; pr public.price_requests; s public.scan_records; next_status text; loc text; cap integer; occupied integer; n integer; result jsonb; entity text; v jsonb; f text[]; ident text; raw text; full_payload boolean:=false;
begin
r:=public.rerun_role(); if r is null then raise exception 'Staff access required'; end if;
if request_id is null then raise exception 'Request ID required'; end if;
select * into cfg from public.store_config for update;
select cr.result into result from public.command_requests cr where cr.id=request_id and cr.user_id=auth.uid();
if found then return result; end if;
if exists(select 1 from public.command_requests where id=request_id) then raise exception 'Request ID belongs to another user'; end if;
entity:=coalesce(args->>'id','');
case cmd
when 'receive' then
select * into p from public.products where id=args->>'productId'; if not found then raise exception 'Unknown product'; end if;
n:=(args->>'quantity')::integer; if n<1 or n>100 then raise exception 'Receive between 1 and 100 units at once'; end if;
for i in 1..n loop
insert into public.units(product_id,status,destination_id) values(p.id,'Received in Store',p.location_id) returning * into u;
insert into public.audit_events(action,entity_id,actor,details) values('Received in Store',u.id,auth.uid(),jsonb_build_object('productId',p.id));
end loop; entity:=p.id;
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
when 'destination' then
if r='associate' then raise exception 'Manager access required'; end if;
select * into u from public.units where id=entity for update;
if not found or u.version is distinct from (args->>'version')::integer then raise exception 'Unit changed or missing'; end if;
if length(trim(coalesce(args->>'reason','')))<3 then raise exception 'Destination change reason required'; end if;
if not exists(select 1 from public.locations where id=args->>'locationId') then raise exception 'Unknown location'; end if;
update public.units set destination_id=args->>'locationId',version=version+1 where id=entity;
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

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('master-workbooks','master-workbooks',false,10485760,array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);
create policy master_download on storage.objects for select to authenticated using(bucket_id='master-workbooks' and (select public.rerun_role()) is not null);
create policy master_upload on storage.objects for insert to authenticated with check(bucket_id='master-workbooks' and (select public.rerun_role()) in ('manager','administrator') and name like auth.uid()::text||'/%');
