-- Run on an initialized test store. All changes roll back.
begin;
do $$
declare
  admin_id uuid;
  associate_id uuid;
  before_id uuid;
  after_id uuid;
  sku text;
  old_price integer;
  req uuid;
  request_key uuid:=gen_random_uuid();
  assets jsonb;
begin
  select id into strict admin_id from public.profiles where role='administrator' and active order by id limit 1;
  select id into strict associate_id from public.profiles where role='associate' and active order by id limit 1;
  select active_revision into strict before_id from public.store_config;
  select id,(data->>'price')::integer into sku,old_price from public.products where id like 'GR-%' order by id limit 1;

  assert not has_function_privilege('anon','public.rerun_approve_price(uuid,uuid,uuid)','execute');
  assert not has_function_privilege('anon','public.rerun_revision_assets(uuid)','execute');
  assert not has_function_privilege('anon','public.rerun_stock_snapshot(boolean)','execute');

  perform set_config('request.jwt.claim.sub',associate_id::text,true);
  req:=(public.rerun_command('price_request',jsonb_build_object(
    'productId',sku,'price',old_price+1,'reason','Rollback latency check'),gen_random_uuid())->>'id')::uuid;
  begin
    perform public.rerun_approve_price(req,before_id,request_key);
    raise exception 'Associate could approve';
  exception when others then if sqlerrm<>'Manager access required' then raise; end if; end;
  assert (public.rerun_stock_snapshot(false)->'profiles')='[]'::jsonb;
  assert not exists(select from jsonb_array_elements(public.rerun_stock_snapshot(true)->'events') e
    where e->>'action' like 'staff_%');

  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  after_id:=public.rerun_approve_price(req,before_id,request_key);
  assert public.rerun_approve_price(req,before_id,request_key)=after_id,'Approval retry wrote a second revision';
  assets:=public.rerun_revision_assets(after_id);
  assert (assets->'prices'->>sku)::integer=old_price+1;
  assert assets->>'baseId'=public.rerun_revision_assets(before_id)->>'baseId';
  assert (public.rerun_stock_snapshot(false)->'revision'->>'id')::uuid=after_id;
  assert (select (data->>'price')::integer=old_price+1 from public.products where id=sku);
  assert (select status='Approved' from public.price_requests where id=req);
  assert (select (p->>'price')::integer=old_price+1 from public.master_revisions,
    jsonb_array_elements(payload->'products') p where id=after_id and p->>'id'=sku);
  assert exists (select from public.audit_events where entity_id=after_id::text and action='master_published');
end $$;
rollback;
