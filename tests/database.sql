-- Hosted verification runs inside one transaction and rolls back every fixture and event.
begin;
select set_config('rerun.test_admin',(select id::text from public.profiles where role='administrator' and active limit 1),true);
select set_config('rerun.test_associate',(select id::text from public.profiles where role='associate' and active limit 1),true);
select set_config('request.jwt.claim.sub',current_setting('rerun.test_admin'),true);
-- Existing confirmed placement fills this fixture location at capacity one.
update public.locations set data=jsonb_set(data,'{capacity}','1') where id='Aisle-4-Shelf-B';
set local role authenticated;
create function pg_temp.expect_command_error(cmd text,args jsonb,expected text) returns void language plpgsql as $$
begin
begin
perform public.rerun_command(cmd,args,gen_random_uuid());
raise exception 'Expected rejection did not occur';
exception when others then
if position(expected in sqlerrm)=0 then raise exception 'Expected %, got %',expected,sqlerrm; end if;
end;
end $$;
do $$
declare s jsonb; u public.units; v integer; duplicate_id uuid:=gen_random_uuid(); scan_id uuid; tag public.tags; before_rev uuid;
begin
s:=public.rerun_snapshot();
if jsonb_array_length(s->'master'->'products')<>8 then raise exception 'Seed master count is wrong'; end if;
before_rev:=(s->'revision'->>'id')::uuid;
perform public.rerun_command('receive','{"productId":"PROD-001","quantity":1}',gen_random_uuid());
select * into u from public.units where product_id='PROD-001' order by created_at desc limit 1;
perform public.rerun_command('transition',jsonb_build_object('id',u.id,'version',u.version,'status','Pending Restock'),duplicate_id);
perform public.rerun_command('transition',jsonb_build_object('id',u.id,'version',u.version,'status','Pending Restock'),duplicate_id);
select version into v from public.units where id=u.id;
if v<>u.version+1 then raise exception 'Duplicate command was applied twice'; end if;
perform pg_temp.expect_command_error('transition',jsonb_build_object('id',u.id,'version',u.version,'status','Restocked'),'changed');
perform pg_temp.expect_command_error('transition',jsonb_build_object('id',u.id,'status','Restocked'),'changed');
perform pg_temp.expect_command_error('transition',jsonb_build_object('id',u.id,'version',v,'status','Restocked'),'Destination is full');
s:=public.rerun_command('scan',jsonb_build_object('raw',jsonb_build_object('Item_ID','PROD-001','Unit_ID',u.id,'Item_Name','Premium Leather Boots','Price',0.01,'Intended_Location','Aisle-4-Shelf-B')::text),gen_random_uuid());
scan_id:=(s->>'id')::uuid;
if s->'findings'<> '["PRICE MISMATCH"]'::jsonb then raise exception 'Server discrepancy comparison failed'; end if;
perform pg_temp.expect_command_error('transition',jsonb_build_object('id',u.id,'version',v,'status','Restocked'),'Acknowledge');
perform public.rerun_command('acknowledge',jsonb_build_object('id',scan_id),gen_random_uuid());
perform public.rerun_command('destination',jsonb_build_object('id',u.id,'version',v,'locationId','Bags-Aisle-6-Shelf-B','reason','Verification overflow'),gen_random_uuid());v:=v+1;
perform public.rerun_command('transition',jsonb_build_object('id',u.id,'version',v,'status','Restocked'),gen_random_uuid());v:=v+1;
perform public.rerun_command('transition',jsonb_build_object('id',u.id,'version',v,'status','Scanned at Register'),gen_random_uuid());v:=v+1;
perform public.rerun_command('transition',jsonb_build_object('id',u.id,'version',v,'status','Sold'),gen_random_uuid());v:=v+1;
perform public.rerun_command('transition',jsonb_build_object('id',u.id,'version',v,'status','Returned'),gen_random_uuid());v:=v+1;
perform pg_temp.expect_command_error('transition',jsonb_build_object('id',u.id,'version',v,'status','Pending Restock'),'Invalid lifecycle');
perform public.rerun_command('transition',jsonb_build_object('id',u.id,'version',v,'status','Inspected'),gen_random_uuid());v:=v+1;
perform public.rerun_command('transition',jsonb_build_object('id',u.id,'version',v,'status','Pending Restock'),gen_random_uuid());v:=v+1;
select * into tag from public.tags where status='Available' order by id limit 1;
perform public.rerun_command('tag_action',jsonb_build_object('id',tag.id,'version',tag.version,'action','assign','unitId',u.id),gen_random_uuid());
perform pg_temp.expect_command_error('tag_action',jsonb_build_object('id',tag.id,'version',tag.version,'action','recover'),'changed');
perform public.rerun_command('tag_action',jsonb_build_object('id',tag.id,'version',tag.version+1,'action','recover'),gen_random_uuid());
perform pg_temp.expect_command_error('tag_action',jsonb_build_object('id',tag.id,'version',tag.version+2,'action','assign','unitId',u.id),'available');
perform public.rerun_command('tag_action',jsonb_build_object('id',tag.id,'version',tag.version+2,'action','inspect'),gen_random_uuid());
perform pg_temp.expect_command_error('transition',jsonb_build_object('id',u.id,'version',v,'status','Stocked Out'),'reason required');
s:=public.rerun_command('scan','{"raw":"PROD-999"}',gen_random_uuid());
if s->'findings'<>'["UNKNOWN ITEM"]'::jsonb or s->>'product_id' is not null then raise exception 'Unknown item became verified'; end if;
begin
perform public.rerun_publish_master((public.rerun_snapshot())->'master',gen_random_uuid(),'not-uploaded.xlsx',gen_random_uuid());
raise exception 'Expected stale master rejection';
exception when others then if position('Master changed' in sqlerrm)=0 then raise; end if; end;
begin
perform public.rerun_publish_master((public.rerun_snapshot())->'master',before_rev,'not-uploaded.xlsx',gen_random_uuid());
raise exception 'Expected missing workbook rejection';
exception when others then if position('Upload the master' in sqlerrm)=0 then raise; end if; end;
if (public.rerun_snapshot())->'revision'->>'id'<>before_rev::text then raise exception 'Failed publication changed active master'; end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('rerun.test_associate'),true);
do $$ begin
perform pg_temp.expect_command_error('settings','{"ageDays":30,"sellThrough":20,"discount":10}','Manager access');
perform pg_temp.expect_command_error('staff_update',jsonb_build_object('id',current_setting('rerun.test_admin'),'role','associate','active',false),'Administrator access');
begin perform public.rerun_publish_master('{}',null,'x',gen_random_uuid()); raise exception 'Expected manager rejection'; exception when others then if position('Manager access' in sqlerrm)=0 then raise; end if; end;
begin insert into public.products values('BAD','Aisle-4-Shelf-B','Clothing','{}');raise exception 'Expected direct write rejection';exception when insufficient_privilege then null;end;
if exists(select 1 from public.profiles where role='administrator') then raise exception 'Associate can read admin profile'; end if;
end $$;
reset role;
rollback;
select 'Passed: atomic idempotency, missing/stale versions, capacity, discrepancy acknowledgment, lifecycle inspection, tag recovery, stock-out reasons, unknown items, failed master publication, role enforcement, direct-write RLS, profile isolation. All fixtures rolled back.' as verification;
