import fs from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
const sb = createClient(
  "https://ikuvbteklxjbsixwhril.supabase.co",
  "sb_publishable_FnpGIa5bHpNIvCz_xlYodA_n8wRubNc",
  { auth: { persistSession: false } },
);
const auth = await sb.auth.setSession(
  JSON.parse(await fs.readFile(".private/admin-session.json", "utf8")),
);
if (auth.error) throw auth.error;
const snapshot = await sb.rpc("rerun_snapshot");
if (snapshot.error) throw snapshot.error;
const profile = snapshot.data.profile;
if (profile.role !== "administrator")
  throw new Error("Administrator setup session required");
const { data, error } = await sb.functions.invoke("staff", {
  body: {
    action: "activation",
    userId: profile.id,
    email: profile.email,
    role: profile.role,
  },
});
if (error) throw error;
const url = `${process.env.BASE_URL ?? "https://rerun-smart-price-tag-psi.vercel.app"}/activate?token_hash=${encodeURIComponent(data.tokenHash)}`;
await fs.writeFile(
  ".private/ADMIN-ACTIVATION.md",
  `# Private ReRun administrator activation\n\nAccount: ${profile.email}\n\n[Activate your account and choose your password](${url})\n\nOpen this link and enter your own password of at least 12 characters. The link is single-use and time-limited. No password was chosen for your account, and no email was sent.\n\nAfter activation, sign in at https://rerun-smart-price-tag-psi.vercel.app. Create employees from Settings and share their activation links privately.\n\nKeep this file private. It is excluded from Git. If the link expires before use, ask me to regenerate it.\n`,
);
await fs.writeFile(
  ".private/admin-session.json",
  JSON.stringify((await sb.auth.getSession()).data.session),
);
console.log(
  "Private administrator activation instructions saved in .private/ADMIN-ACTIVATION.md.",
);

