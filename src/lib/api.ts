import { supabase } from "./supabase";
import type { Master, Snapshot } from "./types";
export class SnapshotError extends Error {
  readonly temporary: boolean;
  constructor(message: string, temporary: boolean) {
    super(message);
    this.temporary = temporary;
  }
}
export async function snapshot(): Promise<Snapshot> {
  const { data, error, status } = await supabase.rpc("rerun_snapshot");
  if (error)
    throw new SnapshotError(error.message, status === 0 || status >= 500);
  return data as Snapshot;
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
  const response = await fetch("/api/master", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token}`,
    },
    body: JSON.stringify(body),
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
