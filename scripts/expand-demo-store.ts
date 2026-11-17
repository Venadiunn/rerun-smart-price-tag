/** Expand the existing demo through the same authenticated publication/command APIs as the app.
 * Dry run: node --env-file=.env.local --import tsx scripts/expand-demo-store.ts
 * Apply: append --apply. Supply SUPABASE_SESSION_FILE pointing to a private active admin session.
 * The journal and session stay in .private; no service key is needed or accepted.
 */
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { expandDemoStore } from "../src/lib/demo-store.js";
import type { Master, Snapshot } from "../src/lib/types.js";

interface Journal {
  before: Snapshot;
  master: Master;
  requestId: string;
  revisionId?: string;
  placements: {
    id: string;
    version: number;
    requestId: string;
    done?: boolean;
  }[];
  completedAt?: string;
}
const apply = process.argv.includes("--apply");
const sessionFile =
  process.env.SUPABASE_SESSION_FILE ?? ".private/admin-session.json";
const base =
  process.env.APP_URL ?? "https://rerun-smart-price-tag-psi.vercel.app";
const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key)
  throw new Error(
    "Load the project's public Supabase configuration with --env-file=.env.local.",
  );
const sb = createClient(url, key, { auth: { persistSession: false } });
const session = await sb.auth.setSession(
  JSON.parse(await fs.readFile(sessionFile, "utf8")),
);
if (session.error) throw session.error;
await fs.writeFile(
  sessionFile,
  JSON.stringify((await sb.auth.getSession()).data.session),
);
const read = async () => {
  const { data, error } = await sb.rpc("rerun_snapshot");
  if (error) throw error;
  if (data.profile.role !== "administrator")
    throw new Error("Active administrator required for demo setup.");
  return data as Snapshot;
};
const journalFile = ".private/store-expansion-1000.json";
await fs.mkdir(path.dirname(journalFile), { recursive: true });
let job: Journal;
try {
  job = JSON.parse(await fs.readFile(journalFile, "utf8"));
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  const before = await read();
  const master = expandDemoStore(before.master, "2026-11-16");
  const placed = before.units.filter(
    (u) => u.current_location_id !== null,
  ).length;
  const needed = Math.max(0, 100 - placed);
  const seenProducts = new Set(
    before.units
      .filter((u) => u.current_location_id !== null)
      .map((u) => u.product_id),
  );
  const candidates = before.units
    .filter(
      (u) =>
        u.status === "Pending Restock" &&
        u.inspected &&
        !before.scans.some(
          (s) =>
            s.product_id === u.product_id &&
            (s.unit_id === null || s.unit_id === u.id) &&
            !s.acknowledged_at &&
            s.findings.some((f) => f !== "VALID ITEM"),
        ),
    )
    .toSorted(
      (a, b) =>
        a.product_id.localeCompare(b.product_id, "en", { numeric: true }) ||
        a.created_at.localeCompare(b.created_at) ||
        a.id.localeCompare(b.id),
    );
  const placements: Journal["placements"] = [];
  for (const u of candidates) {
    if (seenProducts.has(u.product_id)) continue;
    seenProducts.add(u.product_id);
    placements.push({ id: u.id, version: u.version, requestId: randomUUID() });
    if (placements.length === needed) break;
  }
  if (needed === 0) placements.length = 0;
  assert.equal(
    placements.length,
    needed,
    "Not enough eligible mock product units to reach 100 placements safely.",
  );
  job = { before, master, requestId: randomUUID(), placements };
  if (apply) await fs.writeFile(journalFile, JSON.stringify(job));
}
console.log(
  JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    products: job.master.products.length,
    addedProducts:
      job.master.products.length - job.before.master.products.length,
    capacity: job.master.locations.reduce(
      (sum, l) => sum + (l.capacity ?? 0),
      0,
    ),
    additionalPlacements: job.placements.length,
  }),
);
if (apply) {
  let current = await read();
  if (!job.revisionId) {
    if (!isDeepStrictEqual(current.master, job.master)) {
      assert.equal(
        current.revision.id,
        job.before.revision.id,
        "Master changed; review the journal before retrying.",
      );
      const {
        data: { session: active },
      } = await sb.auth.getSession();
      const response = await fetch(new URL("/api/master", base), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${active!.access_token}`,
        },
        body: JSON.stringify({
          action: "publish",
          master: job.master,
          expectedRevision: job.before.revision.id,
          requestId: job.requestId,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      current = await read();
    }
    assert.deepEqual(current.master, job.master);
    job.revisionId = current.revision.id;
    await fs.writeFile(journalFile, JSON.stringify(job));
  }
  assert.equal(
    current.revision.id,
    job.revisionId,
    "Active master changed during setup.",
  );
  for (const item of job.placements) {
    if (item.done) continue;
    const { error } = await sb.rpc("rerun_command", {
      cmd: "transition",
      args: {
        id: item.id,
        version: item.version,
        status: "Restocked",
        reason: "Mock-store pre-sorted demonstration stock",
      },
      request_id: item.requestId,
    });
    if (error) throw error;
    item.done = true;
    await fs.writeFile(journalFile, JSON.stringify(job));
  }
  current = await read();
  assert.equal(current.master.products.length, 1000);
  assert.equal(
    current.master.locations.reduce((sum, l) => sum + (l.capacity ?? 0), 0),
    500,
  );
  assert.ok(
    current.units.filter((u) => u.current_location_id !== null).length >= 100,
  );
  assert.ok(
    job.before.units.every((u) => current.units.some((v) => v.id === u.id)),
    "Existing units must be preserved.",
  );
  assert.equal(current.tags.length, job.before.tags.length);
  assert.ok(
    current.master.locations.every(
      (l) =>
        current.units.filter(
          (u) =>
            u.current_location_id === l.id ||
            (u.status === "Pending Restock" && u.destination_id === l.id),
        ).length <= l.capacity!,
    ),
  );
  const workbook = await sb.storage
    .from("master-workbooks")
    .download(current.revision.storage_path);
  if (workbook.error) throw workbook.error;
  await fs.mkdir("outputs", { recursive: true });
  await fs.writeFile(
    "outputs/ReRun Master Inventory.xlsx",
    Buffer.from(await workbook.data.arrayBuffer()),
  );
  job.completedAt = new Date().toISOString();
  await fs.writeFile(journalFile, JSON.stringify(job));
  await fs.writeFile(
    sessionFile,
    JSON.stringify((await sb.auth.getSession()).data.session),
  );
  console.log(
    JSON.stringify({
      verified: true,
      products: 1000,
      totalUnits: current.units.length,
      placed: current.units.filter((u) => u.current_location_id !== null)
        .length,
      revision: current.revision.revision,
      capacity: 500,
    }),
  );
}
