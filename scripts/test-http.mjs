import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
const url = "https://ikuvbteklxjbsixwhril.supabase.co",
  key = "sb_publishable_FnpGIa5bHpNIvCz_xlYodA_n8wRubNc",
  base = process.env.BASE_URL ?? "http://localhost:5173";
const sb = createClient(url, key, { auth: { persistSession: false } });
await sb.auth.setSession(
  JSON.parse(await fs.readFile(".private/admin-session.json", "utf8")),
);
const {
    data: { session },
  } = await sb.auth.getSession(),
  headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.access_token}`,
  };
const api = async (body) => {
  const response = await fetch(`${base}/api/master`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data;
};
const current = (await sb.rpc("rerun_snapshot")).data;
const original = structuredClone(current.master),
  candidate = structuredClone(original);
candidate.products[0].price += 1;
let published = false;
try {
  const { data: request, error } = await sb.rpc("rerun_command", {
    cmd: "price_request",
    args: {
      productId: candidate.products[0].id,
      price: candidate.products[0].price,
      reason: "Automated HTTP approval verification",
    },
    request_id: crypto.randomUUID(),
  });
  if (error) throw error;
  await api({
    action: "publish",
    master: candidate,
    expectedRevision: current.revision.id,
    requestId: crypto.randomUUID(),
    priceRequestId: request.id,
  });
  published = true;
  const after = (await sb.rpc("rerun_snapshot")).data;
  assert.equal(after.master.products[0].price, candidate.products[0].price);
  assert.equal(
    after.prices.find((p) => p.id === request.id).status,
    "Approved",
  );
  assert.equal(after.units.length, current.units.length);
  const { data: file, error: fileError } = await sb.storage
    .from("master-workbooks")
    .download(after.revision.storage_path);
  if (fileError) throw fileError;
  const parsed = await api({
    action: "import",
    filename: "master.xlsx",
    base64: Buffer.from(await file.arrayBuffer()).toString("base64"),
  });
  assert.equal(parsed.master.products[0].price, candidate.products[0].price);
  console.log(
    "Passed: authenticated price approval, new master revision, workbook round trip, operational-history preservation.",
  );
} finally {
  if (published) {
    const latest = (await sb.rpc("rerun_snapshot")).data;
    await api({
      action: "publish",
      master: original,
      expectedRevision: latest.revision.id,
      requestId: crypto.randomUUID(),
    });
    console.log("Original master values restored through a new revision.");
  }
}
const users = JSON.parse(await fs.readFile(".private/test-users.json", "utf8")),
  staff = createClient(url, key, { auth: { persistSession: false } });
const login = await staff.auth.signInWithPassword({
  email: users.associate.email,
  password: users.associate.password,
});
if (login.error) throw login.error;
const denied = await fetch(`${base}/api/master`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${login.data.session.access_token}`,
  },
  body: JSON.stringify({
    action: "publish",
    master: original,
    expectedRevision: current.revision.id,
    requestId: crypto.randomUUID(),
  }),
});
assert.equal(denied.status, 403);
const { error: anonError } = await createClient(url, key, {
  auth: { persistSession: false },
}).rpc("rerun_snapshot");
assert.ok(anonError);
const signUp = await createClient(url, key, {
  auth: { persistSession: false },
}).auth.signUp({
  email: `blocked-${crypto.randomUUID()}@example.com`,
  password: "Test-only-blocked-password-123!",
});
assert.ok(signUp.error);
console.log(
  "Passed: associate publication denied, anonymous inventory access denied, public signup denied.",
);
await fs.writeFile(
  ".private/admin-session.json",
  JSON.stringify((await sb.auth.getSession()).data.session),
);
