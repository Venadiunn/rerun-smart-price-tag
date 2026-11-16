import fs from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
const sb = createClient(
  "https://ikuvbteklxjbsixwhril.supabase.co",
  "sb_publishable_FnpGIa5bHpNIvCz_xlYodA_n8wRubNc",
  { auth: { persistSession: false } },
);
await sb.auth.setSession(
  JSON.parse(await fs.readFile(".private/admin-session.json", "utf8")),
);
const i = JSON.parse(await fs.readFile(".private/artifact-input.json", "utf8")),
  path = `${i.userId}/${i.revisionId}.xlsx`;
const { error: upload } = await sb.storage
  .from("master-workbooks")
  .upload(path, await fs.readFile("outputs/ReRun Master Inventory.xlsx"), {
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
if (upload) throw upload;
const { error } = await sb.rpc("rerun_publish_master", {
  candidate: i.master,
  expected_revision: i.expectedRevision,
  workbook_path: path,
  request_id: randomUUID(),
});
if (error) throw error;
console.log("Formatted Excel master published as a new immutable revision.");
