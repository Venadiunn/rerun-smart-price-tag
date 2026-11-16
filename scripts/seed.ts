import fs from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { seedMaster } from "../src/lib/seed.js";
import { makeWorkbook } from "../server-lib/workbook.js";
const sb = createClient(
  "https://ikuvbteklxjbsixwhril.supabase.co",
  "sb_publishable_FnpGIa5bHpNIvCz_xlYodA_n8wRubNc",
  { auth: { persistSession: false } },
);
const session = JSON.parse(
  await fs.readFile(".private/admin-session.json", "utf8"),
);
const { error: authError } = await sb.auth.setSession(session);
if (authError) throw authError;
const { data: snap, error } = await sb.rpc("rerun_snapshot");
if (error) throw error;
if (snap.revision && snap.revision.id) {
  console.log("Master already initialized; no seed overwrite.");
  process.exit(0);
}
const revisionId = randomUUID(),
  path = `${session.user.id}/${revisionId}.xlsx`,
  bytes = await makeWorkbook(seedMaster, revisionId, null);
const { error: upload } = await sb.storage
  .from("master-workbooks")
  .upload(path, bytes, {
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
if (upload) throw upload;
const { error: publish } = await sb.rpc("rerun_publish_master", {
  candidate: seedMaster,
  expected_revision: null,
  workbook_path: path,
  request_id: randomUUID(),
});
if (publish) throw publish;
for (const product of seedMaster.products) {
  const { error } = await sb.rpc("rerun_command", {
    cmd: "receive",
    args: { productId: product.id, quantity: 2 },
    request_id: randomUUID(),
  });
  if (error) throw error;
}
for (let n = 1; n <= 20; n++) {
  const { error } = await sb.rpc("rerun_command", {
    cmd: "tag_register",
    args: { id: `TAG-${String(n).padStart(4, "0")}` },
    request_id: randomUUID(),
  });
  if (error) throw error;
}
await fs.mkdir("outputs", { recursive: true });
await fs.writeFile("outputs/ReRun Master Inventory.xlsx", bytes);
await fs.writeFile(
  ".private/admin-session.json",
  JSON.stringify((await sb.auth.getSession()).data.session),
);
console.log(
  "Published master revision 1, received 16 fictional units and registered 20 tags.",
);
