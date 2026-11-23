import { supabase } from "./supabase";
import type { Master, Snapshot, Revision } from "./types";
export class SnapshotError extends Error {
  readonly temporary: boolean;
  constructor(message: string, temporary: boolean) {
    super(message);
    this.temporary = temporary;
  }
}
import { stockIndex, type OpeningLot } from "./opening-stock";
import { applyCatalogPrices, type RevisionAssets } from "./catalog-prices";

interface CatalogCache {
  account: string;
  base?: { id: string; master: Master };
  lots?: OpeningLot[];
  stock?: { changes: string; index: Snapshot["stock"] };
  current?: { id: string; master: Master };
}
let cache: CatalogCache | undefined;
export function resetWorkspaceCache() {
  cache = undefined;
}

export async function snapshot(
  account: string,
  signal: AbortSignal,
  showOverview?: (data: Snapshot) => void,
): Promise<Snapshot> {
  const entry = cache?.account === account ? cache : (cache = { account });
  const read = async (overview_only: boolean) => {
    const { data, error, status } = await supabase
      .rpc("rerun_stock_snapshot", { overview_only })
      .abortSignal(signal);
    signal.throwIfAborted();
    if (error)
      throw new SnapshotError(error.message, status === 0 || status >= 500);
    if (data.profile.id !== account)
      throw new SnapshotError("Staff access required", false);
    return data;
  };
  if (showOverview) {
    const overview = await read(true);
    if (overview.revision) {
      const byLocation = overview.opening as Record<string, number>;
      showOverview({
        ...overview,
        full: false,
        stock: {
          total: Object.values(byLocation).reduce(
            (sum, count) => sum + count,
            0,
          ),
          byLocation,
          byProduct: new Map(),
        },
      } as Snapshot);
    }
  }
  const data = await read(false);
  if (!data.revision) return data as Snapshot;
  const assets: RevisionAssets = data.assets;
  const [master, lots] = await Promise.all([
    (async () => {
      if (entry.base?.id === assets.baseId) return entry.base.master;
      const archive = await supabase.storage
        .from("master-workbooks")
        .download(assets.path.replace(/\.xlsx$/i, ".json.gz"), {}, { signal });
      signal.throwIfAborted();
      if (archive.data) {
        return (await new Response(
          archive.data.stream().pipeThrough(new DecompressionStream("gzip")),
        ).json()) as Master;
      }
      const {
        data: fallback,
        error,
        status,
      } = await supabase
        .from("master_revisions")
        .select("payload")
        .eq("id", assets.baseId)
        .abortSignal(signal)
        .single();
      if (error)
        throw new SnapshotError(error.message, status === 0 || status >= 500);
      return fallback.payload as Master;
    })(),
    (async () => {
      if (entry.lots) return entry.lots;
      const manifest = await supabase
        .rpc("rerun_opening_manifest")
        .abortSignal(signal);
      if (manifest.error)
        throw new SnapshotError(
          manifest.error.message,
          manifest.status === 0 || manifest.status >= 500,
        );
      return (manifest.data as string)
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [product_id, location_id, n] = line.split(",");
          const quantity = Number(n);
          return { product_id, location_id, quantity, remaining: quantity };
        });
    })(),
  ]);
  signal.throwIfAborted();
  entry.base = { id: assets.baseId, master };
  entry.lots = lots;
  if (!entry.current || entry.current.id !== data.revision.id) {
    entry.current = {
      id: data.revision.id,
      master: applyCatalogPrices(master, assets.prices),
    };
  }
  const changes = data.lotChanges ?? {};
  const stamp = JSON.stringify(changes);
  if (entry.stock?.changes !== stamp)
    entry.stock = {
      changes: stamp,
      index: stockIndex(
        lots.map((lot) =>
          Object.hasOwn(changes, lot.product_id)
            ? { ...lot, remaining: changes[lot.product_id] }
            : lot,
        ),
      ),
    };
  return {
    ...data,
    full: true,
    stock: entry.stock.index,
    master: entry.current.master,
    productCount: master.products.length,
  } as Snapshot;
}

export async function approvePrice(priceRequestId: string, revision: string) {
  const { data, error } = await supabase.rpc("rerun_approve_price", {
    price_request_id: priceRequestId,
    expected_revision: revision,
    request_id: crypto.randomUUID(),
  });
  if (error) throw new Error(error.message);
  return data as string;
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
  revision: Revision,
  name = "ReRun Master Inventory.xlsx",
) {
  if (revision.price_only) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const response = await fetch("/api/master", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ action: "download", revisionId: revision.id }),
    });
    if (!response.ok)
      throw new Error(
        (await response.json()).error ?? "Workbook download failed",
      );
    download(await response.blob(), name);
    return;
  }
  const { data, error } = await supabase.storage
    .from("master-workbooks")
    .download(revision.storage_path);
  if (error) throw new Error(error.message);
  download(
    await data.arrayBuffer(),
    name,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
}
