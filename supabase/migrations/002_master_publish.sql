create function public.rerun_publish_master(candidate jsonb,expected_revision uuid,workbook_path text,request_id uuid,price_request_id uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare cfg public.store_config; r text; v jsonb; new_id uuid:=gen_random_uuid(); rev integer; old_result jsonb; pr public.price_requests;
begin
r:=public.rerun_role(); if r not in ('manager','administrator') or r is null then raise exception 'Manager access required'; end if;
select * into cfg from public.store_config for update;
select result into old_result from public.command_requests where id=request_id and user_id=auth.uid();
if found then return (old_result->>'revisionId')::uuid; end if;
if request_id is null then raise exception 'Request ID required'; end if;
if cfg.active_revision is distinct from expected_revision then raise exception 'Master changed. Download the latest revision and review again.'; end if;
if not exists(select 1 from storage.objects where bucket_id='master-workbooks' and name=workbook_path and owner_id=auth.uid()::text) then raise exception 'Upload the master workbook before publication'; end if;
new_id:=replace(split_part(workbook_path,'/',2),'.xlsx','')::uuid;
if jsonb_typeof(candidate->'products')<>'array' or jsonb_array_length(candidate->'products') not between 1 and 10000 or jsonb_typeof(candidate->'locations')<>'array' or jsonb_array_length(candidate->'locations') not between 1 and 1000 or jsonb_typeof(candidate->'categories')<>'array' or jsonb_array_length(candidate->'categories') not between 1 and 1000 then raise exception 'Invalid master structure'; end if;
foreach r in array array['products','locations','categories'] loop
if exists(select 1 from jsonb_array_elements(candidate->r) x where jsonb_typeof(x->'id') is distinct from 'string' or length(x->>'id') not between 1 and 120) then raise exception 'Invalid master identifier'; end if;
if (select count(*) from jsonb_array_elements(candidate->r))<>(select count(distinct x->>'id') from jsonb_array_elements(candidate->r) x) then raise exception 'Duplicate master identifier'; end if;
end loop;
for v in select * from jsonb_array_elements(candidate->'locations') loop
if length(coalesce(v->>'department',''))=0 or length(coalesce(v->>'aisle',''))=0 then raise exception 'Location department and aisle required'; end if;
if v->>'capacity' is not null and ((v->>'capacity')::numeric<>trunc((v->>'capacity')::numeric) or (v->>'capacity')::integer<1) then raise exception 'Invalid capacity'; end if;
if v->>'capacity' is not null and (v->>'capacity')::integer<(select count(*) from public.units where current_location_id=v->>'id') then raise exception 'Capacity is below current occupancy for %',v->>'id'; end if;
end loop;
for v in select * from jsonb_array_elements(candidate->'products') loop
if length(coalesce(v->>'name',''))=0 or length(coalesce(v->>'sku',''))=0 or jsonb_typeof(v->'price') is distinct from 'number' or (v->>'price')::numeric<>trunc((v->>'price')::numeric) or (v->>'price')::numeric not between 0 and 2147483647 then raise exception 'Invalid product name, SKU or price'; end if;
if v->>'cost' is not null and ((v->>'cost')::numeric<>trunc((v->>'cost')::numeric) or (v->>'cost')::numeric not between 0 and 2147483647) then raise exception 'Invalid cost'; end if;
if v->>'cost' is not null and (v->>'price')::integer<(v->>'cost')::integer and exists(select 1 from public.products p where p.id=v->>'id' and (p.data->>'price')::integer>(v->>'price')::integer) then raise exception 'Markdown is below cost floor'; end if;
if not exists(select 1 from jsonb_array_elements(candidate->'locations') l where l->>'id'=v->>'locationId') or not exists(select 1 from jsonb_array_elements(candidate->'categories') c where c->>'id'=v->>'categoryId') then raise exception 'Unknown category or location for %',v->>'id'; end if;
end loop;
if exists(select 1 from (select p->>'id' id,unnest(array[p->>'sku',nullif(p->>'barcode','')]) alias from jsonb_array_elements(candidate->'products') p) a where a.alias is not null group by a.alias having count(distinct id)>1) then raise exception 'Duplicate product alias'; end if;
if exists(select 1 from jsonb_array_elements(candidate->'products') p join jsonb_array_elements(candidate->'products') q on p->>'id'<>q->>'id' and (p->>'sku'=q->>'id' or nullif(p->>'barcode','')=q->>'id')) then raise exception 'Ambiguous product alias'; end if;
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
delete from public.products where id not in(select x->>'id' from jsonb_array_elements(candidate->'products') x);
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
