-- Run on a Supabase test database or in the hosted SQL tool. All fixtures roll back.
begin;
select set_config('request.jwt.claim.sub',(select id::text from public.profiles where active and role='administrator' limit 1),true);
do $$
declare first_result jsonb; second_result jsonb; request uuid:=gen_random_uuid(); n integer;
  revision public.master_revisions; candidate jsonb; reserved_location text;
begin
  insert into public.locations(id,data) values
    ('SORT-TEST-HOME','{"capacity":1}'),('SORT-TEST-OVERFLOW','{"capacity":2}');
  insert into public.products(id,location_id,category_id,data)
    select 'SORT-TEST-P', 'SORT-TEST-HOME',id,'{}' from public.categories limit 1;
  insert into public.units(id,product_id,status,destination_id) values
    ('SORT-TEST-1','SORT-TEST-P','Received in Store','SORT-TEST-HOME'),
    ('SORT-TEST-2','SORT-TEST-P','Received in Store','SORT-TEST-HOME');
  first_result:=public.rerun_command('auto_sort','{}',request);
  assert (first_result->>'sorted')::integer=1, 'Only one free slot may be reserved';
  assert jsonb_array_length(first_result->'waiting')=1, 'Full destination must hold the other unit';
  second_result:=public.rerun_command('auto_sort','{}',request);
  assert first_result=second_result,'Duplicate request must return the same result';
  select count(*) into n from public.units where product_id='SORT-TEST-P' and status='Pending Restock';
  assert n=1,'Reservation must not overbook capacity';
  begin
    perform public.rerun_command('transition',jsonb_build_object('id','SORT-TEST-2','version',1,'status','Pending Restock'),gen_random_uuid());
    raise exception 'Manual transition overbooked a reservation';
  exception when others then
    if sqlerrm not like 'Destination is full or reserved%' then raise; end if;
  end;
  begin
    perform public.rerun_command('destination',jsonb_build_object('id','SORT-TEST-2','version',1,'locationId','SORT-TEST-HOME','reason','capacity test'),gen_random_uuid());
    raise exception 'Manual destination overbooked a reservation';
  exception when others then
    if sqlerrm<>'Overflow destination is full' then raise; end if;
  end;
  first_result:=public.rerun_command('receive','{"productId":"SORT-TEST-P","quantity":1}',gen_random_uuid());
  assert (first_result->>'sorted')::integer=0 and jsonb_array_length(first_result->'waiting')=1, 'Receive must auto-sort and hold at capacity';
  update public.units set destination_id='SORT-TEST-OVERFLOW' where id='SORT-TEST-2';
  first_result:=public.rerun_command('auto_sort','{}',gen_random_uuid());
  assert (select status='Pending Restock' and destination_id='SORT-TEST-OVERFLOW' from public.units where id='SORT-TEST-2'), 'Manager overflow must survive sorting';
  insert into public.units(id,product_id,status,destination_id,inspected) values
    ('SORT-TEST-INSPECTION','SORT-TEST-P','Inspected','SORT-TEST-OVERFLOW',false);
  first_result:=public.rerun_command('auto_sort','{}',gen_random_uuid());
  assert (select status='Inspected' from public.units where id='SORT-TEST-INSPECTION'),'Uninspected unit must remain held';
  update public.units set inspected=true where id='SORT-TEST-INSPECTION';
  insert into public.scan_records(raw,findings,product_id,unit_id,master_revision)
    select '"test"',array['PRICE MISMATCH'],'SORT-TEST-P','SORT-TEST-INSPECTION',active_revision from public.store_config;
  first_result:=public.rerun_command('auto_sort','{}',gen_random_uuid());
  assert (select status='Inspected' from public.units where id='SORT-TEST-INSPECTION'),'Unacknowledged discrepancy must hold sorting';
  select m.* into revision from public.master_revisions m join public.store_config c on c.active_revision=m.id;
  select l.id into reserved_location from public.locations l
    where (select count(*) from public.units u where u.status='Pending Restock' and u.destination_id=l.id)>1
    and exists(select 1 from jsonb_array_elements(revision.payload->'locations') x where x->>'id'=l.id)
    limit 1;
  if reserved_location is not null then
    candidate:=jsonb_set(revision.payload,'{locations}',(
      select jsonb_agg(case when x->>'id'=reserved_location then jsonb_set(x,'{capacity}','1') else x end)
      from jsonb_array_elements(revision.payload->'locations') x));
    begin
      perform public.rerun_publish_master(candidate,revision.id,revision.storage_path,gen_random_uuid());
      raise exception 'Master publication discarded reservations';
    exception when others then
      if sqlerrm not like 'Capacity is below confirmed placements and restock reservations%' then raise; end if;
    end;
  end if;
  perform set_config('request.jwt.claim.sub','',true);
  begin
    perform public.rerun_command('auto_sort','{}',gen_random_uuid());
    raise exception 'Anonymous sorting was permitted';
  exception when others then
    if sqlerrm<>'Staff access required' then raise; end if;
  end;
end $$;
rollback;
