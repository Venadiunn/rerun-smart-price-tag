alter function public.rerun_seed_grocery(jsonb,uuid,text,uuid) set statement_timeout='60s';
alter function public.rerun_publish_master(jsonb,uuid,text,uuid,uuid) set statement_timeout='60s';
alter function public.rerun_publish_master(jsonb,uuid,text,uuid,uuid) set work_mem='24MB';
notify pgrst,'reload schema';
