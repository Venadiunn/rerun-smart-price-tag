-- Add covering indexes for catalog lookups, routing, audit and relation integrity.
create index if not exists products_location_idx on public.products(location_id);
create index if not exists products_category_idx on public.products(category_id);
create index if not exists units_destination_idx on public.units(destination_id);
create index if not exists units_sort_queue_idx on public.units(product_id,created_at,id) where status in ('Received in Store','Inspected');
create index if not exists units_restock_destination_idx on public.units(destination_id) where status='Pending Restock';
create index if not exists audit_actor_idx on public.audit_events(actor);
create index if not exists command_user_idx on public.command_requests(user_id);
create index if not exists display_tag_idx on public.display_updates(tag_id);
create index if not exists display_unit_idx on public.display_updates(unit_id);
create index if not exists master_created_by_idx on public.master_revisions(created_by);
create index if not exists price_product_idx on public.price_requests(product_id);
create index if not exists scans_revision_idx on public.scan_records(master_revision);
create index if not exists scans_product_idx on public.scan_records(product_id);
create index if not exists scans_unit_idx on public.scan_records(unit_id);
create index if not exists config_revision_idx on public.store_config(active_revision);

alter policy profiles_read on public.profiles using (id=(select auth.uid()) or (select public.rerun_role())='administrator');
alter policy master_upload on storage.objects with check (
  bucket_id='master-workbooks' and (select public.rerun_role()) in ('manager','administrator')
  and name like (select auth.uid())::text||'/%'
);

-- Explicitly deny direct API access to private command receipts and invite allowlists.
create policy no_direct_command_access on public.command_requests as restrictive
  for all to anon,authenticated using(false) with check(false);
create policy no_direct_invite_access on public.staff_invites as restrictive
  for all to anon,authenticated using(false) with check(false);
revoke all on public.command_requests,public.staff_invites from anon,authenticated;
update storage.buckets set file_size_limit=2097152 where id='master-workbooks';
