import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { gzipSync, gunzipSync } from "node:zlib";
import { randomUUID } from "node:crypto";
import type { Location, Category, Master } from "../src/lib/types.js";
import {
  applyCatalogPrices,
  type RevisionAssets,
} from "../src/lib/catalog-prices.js";
import { validateMaster } from "../src/lib/domain.js";
import { makeWorkbook, readWorkbook } from "../server-lib/workbook.js";
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST")
    return res.status(405).json({ error: "POST required" });
  try {
    const started = performance.now();
    const token = req.headers.authorization;
    if (!token?.startsWith("Bearer "))
      return res.status(401).json({ error: "Sign in first" });
    const sb = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY!,
      {
        global: { headers: { Authorization: token } },
        auth: { persistSession: false },
      },
    );
    const {
      data: { user },
      error: authError,
    } = await sb.auth.getUser(token.slice(7));
    if (authError || !user)
      return res.status(401).json({ error: "Session expired" });
    const { data: profile } = await sb
      .from("profiles")
      .select("role,active")
      .eq("id", user.id)
      .single();
    const input =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const body = input.gzip
      ? JSON.parse(
          gunzipSync(Buffer.from(input.gzip, "base64"), {
            maxOutputLength: 32 * 1024 * 1024,
          }).toString(),
        )
      : input;
    if (body.action === "download") {
      if (!profile?.active)
        return res.status(403).json({ error: "Staff access required" });
      const receipt = await sb.rpc("rerun_revision_assets", {
        revision_id: body.revisionId,
      });
      if (receipt.error) throw receipt.error;
      const assets = receipt.data as RevisionAssets;
      const archive = await sb.storage
        .from("master-workbooks")
        .download(assets.path.replace(/\.xlsx$/i, ".json.gz"));
      let base: Master;
      if (archive.data)
        base = JSON.parse(
          gunzipSync(Buffer.from(await archive.data.arrayBuffer())).toString(),
        );
      else {
        const row = await sb
          .from("master_revisions")
          .select("payload")
          .eq("id", assets.baseId)
          .single();
        if (row.error) throw row.error;
        base = row.data.payload;
      }
      const workbook = await makeWorkbook(
        applyCatalogPrices(base, assets.prices),
        body.revisionId,
        assets.previous,
      );
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Server-Timing",
        `workbook;dur=${Math.round(performance.now() - started)}`,
      );
      return res.end(Buffer.from(workbook));
    }
    if (
      !profile?.active ||
      !["manager", "administrator"].includes(profile.role)
    )
      return res.status(403).json({ error: "Manager access required" });
    const { data: config, error: snapshotError } = await sb
      .from("store_config")
      .select("active_revision")
      .single();
    const snapshot = {
      revision: config?.active_revision ? { id: config.active_revision } : null,
    };
    if (snapshotError) throw snapshotError;
    if (body.action === "import") {
      if (typeof body.base64 !== "string" || body.base64.length > 22000000)
        throw new Error("Maximum upload size is 16 MB.");
      let locations: Location[] = [],
        categories: Category[] = [];
      if (!String(body.filename).toLowerCase().endsWith(".xlsx")) {
        const [l, c] = await Promise.all([
          sb.from("locations").select("data"),
          sb.from("categories").select("data"),
        ]);
        if (l.error || c.error) throw l.error ?? c.error;
        locations = l.data.map((row) => row.data);
        categories = c.data.map((row) => row.data);
      }
      const parsed = await readWorkbook(
        Buffer.from(body.base64, "base64"),
        String(body.filename),
        { products: [], locations, categories },
      );
      if (parsed.revision && parsed.revision !== snapshot.revision?.id)
        throw new Error(
          "This workbook is an old revision. Download the latest master before editing.",
        );
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Encoding", "gzip");
      return res.end(
        gzipSync(
          JSON.stringify({
            master: parsed.master,
            expectedRevision: snapshot.revision?.id ?? null,
          }),
        ),
      );
    }
    if (body.action !== "publish") throw new Error("Unknown master action");
    const master = validateMaster(body.master);
    if ((snapshot.revision?.id ?? null) !== body.expectedRevision)
      throw new Error("Master changed. Refresh and review again.");
    const revisionId = randomUUID(),
      path = `${user.id}/${revisionId}.xlsx`;
    const generation = performance.now();
    const bytes = await makeWorkbook(master, revisionId, body.expectedRevision);
    const workbookDuration = performance.now() - generation;
    const uploads = performance.now();
    const [workbook, archive] = await Promise.all([
      sb.storage.from("master-workbooks").upload(path, bytes, {
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        upsert: false,
      }),
      sb.storage
        .from("master-workbooks")
        .upload(
          path.replace(/\.xlsx$/, ".json.gz"),
          gzipSync(JSON.stringify(master)),
          { contentType: "application/gzip" },
        ),
    ]);
    if (workbook.error || archive.error) throw workbook.error ?? archive.error;
    const uploadDuration = performance.now() - uploads;
    const publication = performance.now();
    const { data, error } = await sb.rpc("rerun_publish_master", {
      candidate: master,
      expected_revision: body.expectedRevision,
      workbook_path: path,
      request_id: body.requestId,
      price_request_id: body.priceRequestId ?? null,
    });
    if (error) throw error;
    res.setHeader(
      "Server-Timing",
      [
        `workbook;dur=${Math.round(workbookDuration)}`,
        `storage;dur=${Math.round(uploadDuration)}`,
        `database;dur=${Math.round(performance.now() - publication)}`,
      ].join(", "),
    );
    return res.json({ revisionId: data });
  } catch (e) {
    return res.status(400).json({
      error:
        e instanceof Error
          ? e.message
          : typeof e === "object" && e && "message" in e
            ? String(e.message)
            : "Master request failed",
    });
  }
}
