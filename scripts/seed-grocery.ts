import { gzipSync } from "node:zlib";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { groceryMaster } from "./grocery-store";
import { makeWorkbook, readWorkbook } from "../server-lib/workbook";
const sb = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY!,
  { auth: { persistSession: false } },
);
const sessionFile =
  process.env.SUPABASE_SESSION_FILE ?? ".private/admin-session.json";
const { data, error } = await sb.auth.setSession(
  JSON.parse(await fs.readFile(sessionFile, "utf8")),
);
if (error || !data.session) throw Error(error?.message ?? "Session required");
await fs.writeFile(sessionFile, JSON.stringify(data.session));
const snap = await sb.rpc("rerun_snapshot");
if (snap.error) throw snap.error;
const previous = snap.data;
if (previous.profile.role !== "administrator")
  throw Error("Administrator required");
const { master, lots } = groceryMaster(
  previous.master,
  new Date().toISOString().slice(0, 10),
);
const id = randomUUID(),
  path = `${previous.profile.id}/${id}.xlsx`;
const bytes = await makeWorkbook(master, id, previous.revision.id);
const read = await readWorkbook(Buffer.from(bytes), "grocery.xlsx", master);
if (
  read.master.products.length !== master.products.length ||
  read.revision !== id
)
  throw Error("Workbook round trip failed");
console.log({
  variants: master.products.length,
  openingUnits: lots.reduce((s, l) => s + l.quantity, 0),
  bytes: bytes.length,
});
if (process.argv.includes("--apply")) {
  const upload = await sb.storage.from("master-workbooks").upload(path, bytes, {
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  if (upload.error) throw upload.error;
  const archive = await sb.storage
    .from("master-workbooks")
    .upload(
      path.replace(/\.xlsx$/, ".json.gz"),
      gzipSync(JSON.stringify(master)),
      { contentType: "application/gzip" },
    );
  if (archive.error) throw archive.error;
  const published = await sb.rpc("rerun_seed_grocery", {
    candidate: master,
    expected_revision: previous.revision.id,
    workbook_path: path,
    request_id: randomUUID(),
  });
  if (published.error) throw published.error;
  console.log("Published grocery revision", published.data);
}
