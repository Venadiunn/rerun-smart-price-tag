-- Authorization checks against the current catalog; all changes roll back.
begin;
select set_config('rerun.test_admin',(select id::text from public.profiles where role='administrator' and active limit 1),true);
select set_config('rerun.test_associate',(select id::text from public.profiles where role='associate' and active limit 1),true);
select set_config('request.jwt.claim.sub',current_setting('rerun.test_admin'),true);
do $$ begin
  assert not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity),'Every exposed table must have RLS';
  assert not has_function_privilege('anon','public.rerun_command(text,jsonb,uuid)','execute'),'Anonymous command execution must be denied';
  assert not has_function_privilege('anon','public.rerun_snapshot()','execute'),'Anonymous snapshot execution must be denied';
  assert not has_function_privilege('authenticated','rerun_internal.sort_received(text[])','execute'),'Internal sorter must not be directly callable';
  assert not has_schema_privilege('authenticated','rerun_internal','usage'),'Internal schema must not be exposed';
  assert not has_function_privilege('authenticated','rerun_internal.ensure_smart_tags(text[])','execute'),'Internal tag allocator must not be directly callable';
  assert not has_sequence_privilege('authenticated','rerun_internal.smart_tag_serial','usage'),'Internal tag numbers must not be directly mutable';
  assert not has_table_privilege('authenticated','public.staff_invites','select'),'Invite allowlist must be private';
  assert not has_table_privilege('authenticated','public.command_requests','select'),'Command receipts must be private';
  assert (select not public and file_size_limit=2097152 from storage.buckets where id='master-workbooks'),'Master workbook bucket must be private and size limited';
end $$;
set local role authenticated;
do $$
declare result jsonb;
begin
  result:=public.rerun_snapshot();
  assert result->'profile'->>'role'='administrator','Admin session must resolve to active admin';
  assert jsonb_array_length(result->'master'->'products')>=8,'Authoritative catalog must be available';
  perform set_config('request.jwt.claim.sub',current_setting('rerun.test_associate'),true);
  result:=public.rerun_snapshot();
  assert jsonb_array_length(result->'profiles')=0,'Associates cannot list staff profiles';
  assert not exists(select 1 from jsonb_array_elements(result->'events') e where e->>'action' like 'staff_%'),'Associates cannot read staff audit details';
  begin
    perform public.rerun_publish_master('{}',null,'invalid',gen_random_uuid());
    raise exception 'Associate published master';
  exception when others then if sqlerrm<>'Manager access required' then raise; end if; end;
  begin
    perform public.rerun_command('staff_update',jsonb_build_object('id',current_setting('rerun.test_admin'),'role','associate','active',true),gen_random_uuid());
    raise exception 'Associate changed staff access';
  exception when others then if sqlerrm<>'Administrator access required' then raise; end if; end;
  begin
    update public.units set version=version+1;
    if found then raise exception 'Direct unit mutation bypassed the command API'; end if;
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub','',true);
  begin
    perform public.rerun_snapshot();
    raise exception 'Unauthenticated snapshot succeeded';
  exception when others then if sqlerrm<>'Staff access required' then raise; end if; end;
end $$;
rollback;
