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
const { data, error } = await sb.rpc("rerun_snapshot");
if (error) throw error;
for (let i = 0; i < data.units.length; i++) {
  const u = data.units[i];
  if (u.status !== "Received in Store") continue;
  const call = async (cmd: string, args: Record<string, unknown>) => {
    const r = await sb.rpc("rerun_command", {
      cmd,
      args,
      request_id: randomUUID(),
    });
    if (r.error) throw r.error;
  };
  await call("transition", {
    id: u.id,
    version: u.version,
    status: "Pending Restock",
    reason: "Fictional demonstration setup",
  });
  if (i % 2)
    await call("transition", {
      id: u.id,
      version: u.version + 1,
      status: "Restocked",
      reason: "Fictional demonstration setup",
    });
  const tag = data.tags[i];
  if (tag?.status === "Available")
    await call("tag_action", {
      id: tag.id,
      version: tag.version,
      action: "assign",
      unitId: u.id,
      source: "Fictional demonstration setup",
    });
}
console.log(
  "Fictional pending/restocked units and reusable tag assignments initialized.",
);
