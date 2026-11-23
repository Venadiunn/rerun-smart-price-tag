import { supabase } from "./supabase";
import type { Master, Snapshot } from "./types";
export class SnapshotError extends Error {
  readonly temporary: boolean;
  constructor(message: string, temporary: boolean) {
    super(message);
    this.temporary = temporary;
  }
}
import { stockIndex } from "./opening-stock";
let cachedMaster: { id: string; master: Master; manifest: string } | undefined;
export async function snapshot(): Promise<Snapshot> {
  const { data, error, status } = await supabase.rpc("rerun_stock_snapshot");
  if (error)
    throw new SnapshotError(error.message, status === 0 || status >= 500);
  if (!data.revision) return data as Snapshot;
  if (!cachedMaster || cachedMaster.id !== data.revision.id) {
    const [archive, manifest] = await Promise.all([
      supabase.storage
        .from("master-workbooks")
        .download(data.revision.storage_path.replace(/\.xlsx$/i, ".json.gz")),
      supabase.rpc("rerun_opening_manifest"),
    ]);
    if (manifest.error) throw new SnapshotError(manifest.error.message, true);
    let master: Master;
    if (archive.data) {
      master = await new Response(
        archive.data.stream().pipeThrough(new DecompressionStream("gzip")),
      ).json();
    } else {
      const result = await supabase
        .from("master_revisions")
        .select("payload")
        .eq("id", data.revision.id)
        .single();
      if (result.error) throw new SnapshotError(result.error.message, true);
      master = result.data.payload;
    }
    cachedMaster = { id: data.revision.id, master, manifest: manifest.data };
  }
  const changes = data.lotChanges ?? {};
  const stock = stockIndex(
    cachedMaster.manifest
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [product_id, location_id, n] = line.split(",");
        const quantity = Number(n);
        return {
          product_id,
          location_id,
          quantity,
          remaining: changes[product_id] ?? quantity,
        };
      }),
  );
  return {
    ...data,
    lotChanges: undefined,
    master: cachedMaster.master,
    stock,
  } as Snapshot;
}
export async function command<T = { ok: boolean; id: string }>(
  cmd: string,
  args: Record<string, unknown>,
  requestId = crypto.randomUUID(),
): Promise<T> {
  const { data, error } = await supabase.rpc("rerun_command", {
    cmd,
    args,
    request_id: requestId,
  });
  if (error) throw new Error(error.message);
  return data as T;
}
export async function masterRequest(body: Record<string, unknown>) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  // Large catalog requests stay within the serverless HTTP body limit.
  const json = JSON.stringify(body);
  let encoded = json;
  if (json.length > 500000) {
    const compressed = await new Response(
      new Blob([json]).stream().pipeThrough(new CompressionStream("gzip")),
    ).blob();
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(compressed);
    });
    encoded = JSON.stringify({ gzip: base64 });
  }
  const response = await fetch("/api/master", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token}`,
    },
    body: encoded,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Master request failed");
  return result;
}
export const publishMaster = (
  master: Master,
  expectedRevision: string | null,
  priceRequestId?: string,
) =>
  masterRequest({
    action: "publish",
    master,
    expectedRevision,
    requestId: crypto.randomUUID(),
    priceRequestId,
  });
export function download(
  content: BlobPart,
  name: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([content], { type })),
    anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function exportCSV(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]),
    quote = (v: unknown) => {
      const text = String(v ?? "");
      return (
        '"' +
        (/^[=+\-@\t\r]/.test(text) ? "'" + text : text).replaceAll('"', '""') +
        '"'
      );
    };
  download(
    [
      cols.map(quote).join(","),
      ...rows.map((r) => cols.map((c) => quote(r[c])).join(",")),
    ].join("\r\n"),
    filename,
    "text/csv",
  );
}
export async function downloadMaster(
  path: string,
  name = "ReRun Master Inventory.xlsx",
) {
  const { data, error } = await supabase.storage
    .from("master-workbooks")
    .download(path);
  if (error) throw new Error(error.message);
  download(
    await data.arrayBuffer(),
    name,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
}
