import fs from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
const sb = createClient(
  "https://ikuvbteklxjbsixwhril.supabase.co",
  "sb_publishable_FnpGIa5bHpNIvCz_xlYodA_n8wRubNc",
  { auth: { persistSession: false } },
);
const { data, error } = await sb.auth.setSession(
  JSON.parse(await fs.readFile(".private/admin-session.json", "utf8")),
);
if (error) throw error;
await fs.writeFile(".private/admin-session.json", JSON.stringify(data.session));
console.log("Private setup session refreshed.");
