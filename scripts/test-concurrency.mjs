import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
const sb = createClient(
  "https://ikuvbteklxjbsixwhril.supabase.co",
  "sb_publishable_FnpGIa5bHpNIvCz_xlYodA_n8wRubNc",
  { auth: { persistSession: false } },
);
await sb.auth.setSession(
  JSON.parse(await fs.readFile(".private/admin-session.json", "utf8")),
);
const read = async () => {
  const { data, error } = await sb.rpc("rerun_snapshot");
  if (error) throw error;
  return data;
};
const call = async (cmd, args) => {
  const { data, error } = await sb.rpc("rerun_command", {
    cmd,
    args,
    request_id: crypto.randomUUID(),
  });
  if (error) throw new Error(error.message);
  return data;
};
const publish = async (master, expectedRevision) => {
  const {
    data: { session },
  } = await sb.auth.getSession();
  const response = await fetch(
    `${process.env.BASE_URL ?? "http://localhost:5173"}/api/master`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        action: "publish",
        master,
        expectedRevision,
        requestId: crypto.randomUUID(),
      }),
    },
  );
  const out = await response.json();
  if (!response.ok) throw new Error(out.error);
};
const before = await read(),
  units = before.units
    .filter((u) => u.status === "Pending Restock" && !u.current_location_id)
    .slice(0, 2);
assert.equal(units.length, 2, "Two pending demonstration units are required");
const location = before.master.locations[0],
  occupied = before.units.filter(
    (u) => u.current_location_id === location.id,
  ).length;
let changed = false;
try {
  const candidate = structuredClone(before.master);
  candidate.locations.find((l) => l.id === location.id).capacity = occupied + 1;
  await publish(candidate, before.revision.id);
  changed = true;
  for (const u of units)
    await call("destination", {
      id: u.id,
      version: u.version,
      locationId: location.id,
      reason: "Automated concurrent-capacity verification",
    });
  const ready = await read();
  const results = await Promise.allSettled(
    units.map((u) => {
      const current = ready.units.find((x) => x.id === u.id);
      return call("transition", {
        id: u.id,
        version: current.version,
        status: "Restocked",
        reason: "Automated concurrent-capacity verification",
      });
    }),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    results.filter(
      (r) =>
        r.status === "rejected" &&
        String(r.reason).includes("Destination is full"),
    ).length,
    1,
  );
  const after = await read();
  assert.equal(
    after.units.filter((u) => u.current_location_id === location.id).length,
    occupied + 1,
  );
  console.log(
    "Passed: two simultaneous restocks competing for one free slot produced exactly one success and one capacity rejection.",
  );
} finally {
  if (changed) {
    for (const original of units) {
      let latest = (await read()).units.find((u) => u.id === original.id);
      if (latest.status === "Restocked") {
        await call("transition", {
          id: latest.id,
          version: latest.version,
          status: "Pending Restock",
          reason: "Restore concurrency verification fixture",
        });
        latest = (await read()).units.find((u) => u.id === original.id);
      }
      if (latest.destination_id !== original.destination_id)
        await call("destination", {
          id: latest.id,
          version: latest.version,
          locationId: original.destination_id,
          reason: "Restore concurrency verification fixture",
        });
    }
    const latest = await read(),
      restored = structuredClone(latest.master);
    restored.locations.find((l) => l.id === location.id).capacity =
      location.capacity;
    await publish(restored, latest.revision.id);
    console.log(
      "Original unit destinations, pending statuses and location capacity restored.",
    );
  }
}
await fs.writeFile(
  ".private/admin-session.json",
  JSON.stringify((await sb.auth.getSession()).data.session),
);

