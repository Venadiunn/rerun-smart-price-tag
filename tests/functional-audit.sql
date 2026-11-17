-- Complete operational paths use isolated fixtures and roll back at the end.
begin;
select set_config('request.jwt.claim.sub',(select id::text from public.profiles where active and role='administrator' limit 1),true);
select id from public.store_config for update;
update public.units set status='Offered';
do $$
declare result jsonb; repeat_result jsonb; req uuid:=gen_random_uuid(); uid text; tag public.tags;
  unit public.units; display public.display_updates; price public.price_requests; rev public.master_revisions;
begin
  insert into public.locations(id,data) values('AUDIT-HOME','{"capacity":2}'),('AUDIT-OVERFLOW','{"capacity":2}');
  insert into public.products(id,location_id,category_id,data) select 'AUDIT-PRODUCT','AUDIT-HOME',id,
    '{"id":"AUDIT-PRODUCT","name":"Functional Audit Product","price":2500,"cost":1000,"sku":"AUDIT-SKU","barcode":"AUDIT-BARCODE","locationId":"AUDIT-HOME"}' from public.categories limit 1;
  result:=public.rerun_command('receive','{"productId":"AUDIT-PRODUCT","quantity":1}',req);
  repeat_result:=public.rerun_command('receive','{"productId":"AUDIT-PRODUCT","quantity":1}',req);
  assert result=repeat_result,'A repeated receive must be idempotent';
  uid:=result->'unitIds'->>0;
  select * into unit from public.units where id=uid;
  assert unit.status='Pending Restock','Receive must route a unit automatically';
  select * into tag from public.tags where unit_id=uid;
  assert tag.status='Assigned','Capacity-allocated unit must receive a smart tag';
  begin
    perform public.rerun_command('tag_action',jsonb_build_object('id',tag.id,'version',tag.version,'action','retire'),gen_random_uuid());
    raise exception 'Assigned tag was retired without recovery';
  exception when others then if sqlerrm<>'Recover the tag before retiring it' then raise; end if; end;
  perform public.rerun_command('tag_register','{"id":"TAG-AUDIT-SPARE"}',gen_random_uuid());
  begin
    perform public.rerun_command('tag_action',jsonb_build_object('id','TAG-AUDIT-SPARE','version',1,'action','assign','unitId',uid),gen_random_uuid());
    raise exception 'Unit received a duplicate tag';
  exception when others then if sqlerrm<>'This unit already has a tag' then raise; end if; end;
  perform public.rerun_command('tag_action','{"id":"TAG-AUDIT-SPARE","version":1,"action":"retire"}',gen_random_uuid());
  assert (select status='Retired' from public.tags where id='TAG-AUDIT-SPARE'),'Unassigned damaged tags must be retireable';
  result:=public.rerun_command('scan',jsonb_build_object('raw','rerun:tag:'||tag.id),gen_random_uuid());
  assert result->>'unit_id'=uid and result->'findings'='["VALID ITEM"]','Tag scan must resolve the current unit';
  result:=public.rerun_command('display_create',jsonb_build_object('id',tag.id),gen_random_uuid());
  select * into display from public.display_updates where id=(result->>'id')::uuid;
  begin
    perform public.rerun_command('display_action',jsonb_build_object('id',display.id,'version',display.version,'status','Verified'),gen_random_uuid());
    raise exception 'Display skipped the written state';
  exception when others then if sqlerrm<>'Invalid display update transition' then raise; end if; end;
  perform public.rerun_command('display_action',jsonb_build_object('id',display.id,'version',display.version,'status','Failed'),gen_random_uuid());
  select * into display from public.display_updates where id=display.id;
  perform public.rerun_command('display_action',jsonb_build_object('id',display.id,'version',display.version,'status','Pending'),gen_random_uuid());
  select * into display from public.display_updates where id=display.id;
  assert display.attempt=2,'Retry must increment the simulated attempt count';
  perform public.rerun_command('display_action',jsonb_build_object('id',display.id,'version',display.version,'status','Written'),gen_random_uuid());
  select * into display from public.display_updates where id=display.id;
  perform public.rerun_command('display_action',jsonb_build_object('id',display.id,'version',display.version,'status','Verified'),gen_random_uuid());
  assert (select status='Verified' from public.display_updates where id=display.id),'Simulated display path must complete';
  perform public.rerun_command('transition',jsonb_build_object('id',uid,'version',unit.version,'status','Restocked'),gen_random_uuid());
  select * into unit from public.units where id=uid;
  assert unit.current_location_id='AUDIT-HOME','Restocking must record a placement';
  begin
    perform public.rerun_command('transition',jsonb_build_object('id',uid,'version',unit.version-1,'status','Scanned at Register'),gen_random_uuid());
    raise exception 'Stale version was accepted';
  exception when others then if sqlerrm not like 'This unit changed%' then raise; end if; end;
  perform public.rerun_command('transition',jsonb_build_object('id',uid,'version',unit.version,'status','Scanned at Register'),gen_random_uuid());
  select * into unit from public.units where id=uid;
  perform public.rerun_command('transition',jsonb_build_object('id',uid,'version',unit.version,'status','Sold'),gen_random_uuid());
  perform public.rerun_command('tag_action',jsonb_build_object('id',tag.id,'version',tag.version,'action','recover'),gen_random_uuid());
  select * into tag from public.tags where id=tag.id;
  assert tag.status='Inspection' and tag.unit_id is null,'Recovered tag must wait for inspection';
  perform public.rerun_command('tag_action',jsonb_build_object('id',tag.id,'version',tag.version,'action','inspect'),gen_random_uuid());
  select * into unit from public.units where id=uid;
  perform public.rerun_command('transition',jsonb_build_object('id',uid,'version',unit.version,'status','Returned'),gen_random_uuid());
  select * into unit from public.units where id=uid;
  assert not unit.inspected,'Returned merchandise must require inspection';
  begin
    perform public.rerun_command('transition',jsonb_build_object('id',uid,'version',unit.version,'status','Pending Restock'),gen_random_uuid());
    raise exception 'Uninspected return was rerouted';
  exception when others then if sqlerrm not like 'Invalid lifecycle transition%' then raise; end if; end;
  perform public.rerun_command('transition',jsonb_build_object('id',uid,'version',unit.version,'status','Inspected'),gen_random_uuid());
  select * into unit from public.units where id=uid;
  assert unit.inspected and unit.status='Pending Restock','Inspection must reroute returned stock';
  assert exists(select 1 from public.tags where unit_id=uid),'Inspected return must regain tag coverage';
  perform public.rerun_command('destination',jsonb_build_object('id',uid,'version',unit.version,'locationId','AUDIT-OVERFLOW','reason','Audited overflow routing'),gen_random_uuid());
  select * into unit from public.units where id=uid;
  assert unit.destination_id='AUDIT-OVERFLOW','Manager overflow must persist';
  begin
    perform public.rerun_command('transition',jsonb_build_object('id',uid,'version',unit.version,'status','Stocked Out'),gen_random_uuid());
    raise exception 'Stock-out without reason was accepted';
  exception when others then if sqlerrm<>'Stock-out reason required' then raise; end if; end;
  perform public.rerun_command('transition',jsonb_build_object('id',uid,'version',unit.version,'status','Stocked Out','reason','Audit removal'),gen_random_uuid());
  result:=public.rerun_command('receive','{"productId":"AUDIT-PRODUCT","quantity":3}',gen_random_uuid());
  assert (result->>'sorted')::integer=2 and jsonb_array_length(result->'waiting')=1,'Only two new units fit the home fixture';
  assert (select count(*) from public.tags t join public.units u on t.unit_id=u.id where u.product_id='AUDIT-PRODUCT' and u.status='Pending Restock')=2,'Each allocated unit needs exactly one tag';
  assert not exists(select 1 from public.tags t join public.units u on t.unit_id=u.id where u.product_id='AUDIT-PRODUCT' and u.status='Received in Store'),'Unit waiting for capacity must not consume a new tag';
  result:=public.rerun_command('price_request','{"productId":"AUDIT-PRODUCT","price":2300,"reason":"Audited request"}',gen_random_uuid());
  select * into price from public.price_requests where id=(result->>'id')::uuid;
  perform public.rerun_command('price_reject',jsonb_build_object('id',price.id,'version',price.version),gen_random_uuid());
  assert (select status='Rejected' from public.price_requests where id=price.id),'Manager price rejection must persist';
  perform public.rerun_command('settings','{"ageDays":120,"sellThrough":40,"discount":15}',gen_random_uuid());
  assert (select (settings->>'ageDays')::integer=120 from public.store_config),'Markdown settings must update';
  select m.* into rev from public.master_revisions m join public.store_config c on c.active_revision=m.id;
  begin
    perform public.rerun_publish_master(rev.payload,null,rev.storage_path,gen_random_uuid());
    raise exception 'Stale master publication was accepted';
  exception when others then if sqlerrm not like 'Master changed%' then raise; end if; end;
  begin
    perform public.rerun_publish_master(rev.payload,rev.id,'missing.xlsx',gen_random_uuid());
    raise exception 'Missing workbook was accepted';
  exception when others then if sqlerrm<>'Upload the master workbook before publication' then raise; end if; end;
  assert (select count(*) from public.units where product_id='AUDIT-PRODUCT')=4,'Idempotency must preserve exact unit count';
end $$;
rollback;
