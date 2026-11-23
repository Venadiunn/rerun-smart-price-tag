-- The existing unique index on tags(unit_id) serves the overview query.
drop index if exists public.rerun_tags_assigned_unit_idx;
