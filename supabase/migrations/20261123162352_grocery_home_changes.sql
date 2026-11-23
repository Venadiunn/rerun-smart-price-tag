-- A master home change creates restock work for every previously untouched unit of that SKU.
create function rerun_internal.route_opening_stock() returns trigger language plpgsql set search_path='' as $$
declare lot rerun_internal.opening_lots; capacity integer; committed integer; code text;
begin
 select * into lot from rerun_internal.opening_lots where product_id=new.id and remaining>0 for update;
 if not found then return new; end if;
 select (data->>'capacity')::integer into capacity from public.locations where id=new.location_id for update;
 select count(*)+rerun_internal.remaining_at(new.location_id) into committed from public.units
 where current_location_id=new.location_id or (destination_id=new.location_id and status='Pending Restock');
 if capacity is not null and committed+lot.remaining>capacity then
   raise exception 'Destination cannot reserve the remaining opening units for %',new.id;
 end if;
 for code in select 'UNIT-'||new.id||'-'||i from generate_series(1,lot.quantity) i
 where not exists(select from public.units u where u.id='UNIT-'||new.id||'-'||i)
 loop
   perform rerun_internal.open_unit(code);
   update public.units set destination_id=new.location_id,status='Pending Restock',version=version+1 where id=code;
   insert into public.audit_events(action,entity_id,details,actor)
   values('Destination changed',code,jsonb_build_object('previous',old.location_id,'next',new.location_id),auth.uid());
 end loop;
 return new;
end $$;
revoke all on function rerun_internal.route_opening_stock() from public,anon,authenticated;
create trigger grocery_home_changed after update of location_id on public.products
for each row when (old.location_id is distinct from new.location_id) execute function rerun_internal.route_opening_stock();
