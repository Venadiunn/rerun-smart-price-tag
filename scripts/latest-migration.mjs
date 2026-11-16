import fs from "node:fs/promises";
const core = await fs.readFile("supabase/migrations/001_rerun.sql", "utf8"),
  master = await fs.readFile(
    "supabase/migrations/002_master_publish.sql",
    "utf8",
  );
const latest =
  core
    .slice(
      core.indexOf("create function public.rerun_snapshot"),
      core.indexOf("insert into storage.buckets"),
    )
    .replaceAll("create function", "create or replace function") +
  "\n" +
  master.replaceAll("create function", "create or replace function") +
  `\ndrop policy staff_read on public.audit_events;\ncreate policy staff_read on public.audit_events for select to authenticated using ((select public.rerun_role()) is not null and (action not like 'staff_%' or (select public.rerun_role())='administrator'));\n`;
await fs.writeFile("supabase/migrations/007_relocation_and_audit.sql", latest);
await fs.writeFile(
  "supabase/migrations/006_cost_floor.sql",
  master.replaceAll("create function", "create or replace function"),
);
console.log(latest);
