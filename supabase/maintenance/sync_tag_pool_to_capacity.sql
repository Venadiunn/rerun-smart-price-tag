-- Run through a trusted administrator SQL connection. Re-running adds no duplicates.
-- Keep all existing unit assignments and history; never delete surplus tags.
begin;
select set_config('request.jwt.claim.sub',(select id::text from public.profiles where role='administrator' and active limit 1),true);
select id from public.store_config for update;
do $$
declare target integer; existing integer; cursor_number integer:=1; tag_id text;
  original_assignments jsonb;
begin
  if exists(select 1 from public.locations where data->>'capacity' is null) then
    raise exception 'Set finite capacities before sizing the tag pool';
  end if;
  select sum((data->>'capacity')::integer) into target from public.locations;
  if target is null or target<1 then raise exception 'Store capacity must be positive'; end if;
  select count(*)+(select coalesce(sum(remaining),0) from rerun_internal.opening_lots) into existing from public.tags;
  if existing>target then raise exception 'Existing tags exceed capacity; review the pool without deleting history'; end if;
  select coalesce(jsonb_object_agg(id,unit_id),'{}') into original_assignments from public.tags where unit_id is not null;
  for i in 1..(target-existing) loop
    loop
      tag_id:='TAG-POOL-'||lpad(cursor_number::text,greatest(6,length(cursor_number::text)),'0');
      cursor_number:=cursor_number+1;
      exit when not exists(select 1 from public.tags where id=tag_id);
    end loop;
    perform public.rerun_command('tag_register',jsonb_build_object('id',tag_id),gen_random_uuid());
  end loop;
  assert (select count(*) from public.tags)+(select coalesce(sum(remaining),0) from rerun_internal.opening_lots)=target,'Tag count must match slot capacity';
  assert not exists(select 1 from jsonb_each_text(original_assignments) old
    where not exists(select 1 from public.tags t where t.id=old.key and t.unit_id=old.value)),
    'Existing tag assignments must be preserved';
end $$;
select jsonb_build_object('capacity',(select sum((data->>'capacity')::integer) from public.locations),
  'totalTags',(select count(*) from public.tags)+(select coalesce(sum(remaining),0) from rerun_internal.opening_lots),'assigned',(select count(*) from public.tags where status='Assigned')+(select coalesce(sum(remaining),0) from rerun_internal.opening_lots),
  'available',(select count(*) from public.tags where status='Available')) as verified_tag_pool;
commit;
