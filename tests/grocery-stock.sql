-- Verify the first touch of a grocery label, a repeat scan, and a sale atomically.
begin;
select set_config('request.jwt.claim.sub',(select id::text from public.profiles where active and role='administrator' limit 1),true);
select id from public.store_config for update;
do $$
declare lot rerun_internal.opening_lots; uid text; tag text; before_units bigint; before_tags bigint; result jsonb;
begin
 select * into strict lot from rerun_internal.opening_lots where remaining=quantity order by product_id limit 1;
 uid:='UNIT-'||lot.product_id||'-1';
 tag:='TAG-'||lot.product_id||'-1';
 select (select count(*) from public.units)+sum(remaining), (select count(*) from public.tags)+sum(remaining)
 into before_units,before_tags from rerun_internal.opening_lots;
 result:=public.rerun_command('scan',jsonb_build_object('raw',tag),gen_random_uuid());
 assert result->>'unit_id'=uid and result->'findings' ? 'VALID ITEM','Tag scan must resolve actual opening unit';
 perform public.rerun_command('open_unit',jsonb_build_object('id',uid),gen_random_uuid());
 assert (select remaining=lot.quantity-1 from rerun_internal.opening_lots where product_id=lot.product_id),'Repeat scan allocated the unit twice';
 assert exists(select from public.tags where id=tag and unit_id=uid and status='Assigned'),'Tag was not assigned';
 assert before_units=(select count(*) from public.units)+(select sum(remaining) from rerun_internal.opening_lots),'Stock changed on scan';
 assert before_tags=(select count(*) from public.tags)+(select sum(remaining) from rerun_internal.opening_lots),'Tag coverage changed on scan';
 perform public.rerun_command('transition',jsonb_build_object('id',uid,'status','Scanned at Register','version',(select version from public.units where id=uid)),gen_random_uuid());
 perform public.rerun_command('transition',jsonb_build_object('id',uid,'status','Sold','version',(select version from public.units where id=uid)),gen_random_uuid());
 assert exists(select from public.units where id=uid and status='Sold' and current_location_id is null),'Sale must release its placement';
 -- A master destination edit reserves space and retains each original placement until staff confirm the move.
 update public.products set location_id='G2-BAY-1',data=jsonb_set(data,'{locationId}','"G2-BAY-1"') where id=lot.product_id;
 assert (select remaining=0 from rerun_internal.opening_lots where product_id=lot.product_id),'Moved stock must be individually addressable';
 assert (select count(*)=lot.quantity-1 from public.units where product_id=lot.product_id and destination_id='G2-BAY-1' and current_location_id=lot.location_id and status='Pending Restock'),'All untouched units must reserve new home positions';
end $$;
rollback;
