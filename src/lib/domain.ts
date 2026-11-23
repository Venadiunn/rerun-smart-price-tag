import { z } from "zod";
import type { Master, Product, ScanResult, Unit } from "./types.js";
const code = z.string().trim().min(1).max(120);
const category = z.object({ id: code, name: code });
const location = z.object({
  id: code,
  department: code,
  aisle: code,
  rack: z.string().max(120),
  shelf: z.string().max(120),
  capacity: z.number().int().positive().nullable(),
});
const product = z.object({
  id: code,
  sku: code,
  barcode: z.string().max(120),
  name: code,
  price: z.number().int().min(0),
  cost: z.number().int().min(0).nullable(),
  categoryId: code,
  subcategory: z.string().max(120),
  classification: z.string().max(120),
  supplierId: z.string().max(120),
  departmentCode: z.string().max(120),
  taxable: z.boolean(),
  size: z.string().max(120),
  color: z.string().max(120),
  locationId: code,
  introducedAt: z.iso.date(),
});
export const masterSchema = z.object({
  products: z.array(product).min(1).max(50000),
  locations: z.array(location).min(1).max(1000),
  categories: z.array(category).min(1).max(1000),
});
export function validateMaster(input: unknown): Master {
  const value = masterSchema.parse(input);
  for (const [name, rows] of Object.entries(value))
    if (new Set(rows.map((x) => x.id)).size !== rows.length)
      throw new Error(`Duplicate identifier in ${name}`);
  const aliases = new Set<string>(),
    ids = new Set(value.products.map((p) => p.id));
  for (const p of value.products) {
    for (const alias of new Set([p.sku, p.barcode].filter(Boolean))) {
      if (aliases.has(alias) || (ids.has(alias) && alias !== p.id))
        throw new Error(`Duplicate or ambiguous SKU/barcode: ${alias}`);
      aliases.add(alias);
    }
    if (!value.locations.some((l) => l.id === p.locationId))
      throw new Error(`Product ${p.id}: unknown location ${p.locationId}`);
    if (!value.categories.some((c) => c.id === p.categoryId))
      throw new Error(`Product ${p.id}: unknown category ${p.categoryId}`);
  }
  return {
    products: value.products.map((p) => ({ ...p, cost: p.cost ?? null })),
    locations: value.locations.map((l) => ({
      ...l,
      capacity: l.capacity ?? null,
    })),
    categories: value.categories,
  };
}
export function parseScan(
  raw: string,
  master: Master,
  units: Unit[],
  tags: { id: string; unit_id: string | null }[],
  origin = "",
): ScanResult {
  if (!raw.trim() || raw.length > 32768)
    throw new Error(
      "Enter a supported identifier or QR payload (maximum 32 KB).",
    );
  let identifier = raw.trim(),
    payload: unknown = identifier;
  let full: Record<string, unknown> | null = null;
  if (identifier.startsWith("{") || identifier.startsWith("[")) {
    try {
      payload = JSON.parse(identifier);
    } catch {
      throw new Error("Malformed QR JSON.");
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload))
      throw new Error("QR JSON must be an object.");
    full = payload as Record<string, unknown>;
    if (typeof full.Item_ID !== "string" || !full.Item_ID.trim())
      throw new Error("QR JSON requires Item_ID.");
    identifier = typeof full.Unit_ID === "string" ? full.Unit_ID : full.Item_ID;
  } else if (/^https?:/i.test(identifier)) {
    const url = new URL(identifier);
    if (
      !origin ||
      url.origin !== origin ||
      url.pathname !== "/scan" ||
      !url.searchParams.get("code")
    )
      throw new Error(
        "This QR link does not belong to ReRun. Enter an item identifier instead.",
      );
    identifier = url.searchParams.get("code")!;
  }
  identifier = identifier.replace(/^rerun:(unit|tag):/, "");
  const tag = tags.find((t) => t.id === identifier);
  if (tag) {
    if (!tag.unit_id)
      return {
        productId: null,
        unitId: null,
        findings: ["UNASSIGNED TAG"],
        payload,
      };
    identifier = tag.unit_id;
  }
  const unit = units.find((u) => u.id === identifier);
  const match = master.products.find(
    (p) =>
      p.id === (unit?.product_id ?? identifier) ||
      p.sku === identifier ||
      (p.barcode && p.barcode === identifier),
  );
  if (!match)
    return {
      productId: null,
      unitId: null,
      findings: ["UNKNOWN ITEM"],
      payload,
    };
  if (full && full.Item_ID !== match.id)
    throw new Error("Item_ID and Unit_ID identify different products.");
  const findings: string[] = [];
  if (full) {
    if (typeof full.Item_Name !== "string" || full.Item_Name !== match.name)
      findings.push("ITEM NAME MISMATCH");
    if (
      typeof full.Price !== "number" ||
      !Number.isFinite(full.Price) ||
      Math.abs(full.Price * 100 - match.price) > 0.00001
    )
      findings.push("PRICE MISMATCH");
    if (full.Intended_Location == null || full.Intended_Location === "")
      findings.push("MISSING LOCATION");
    else if (full.Intended_Location !== match.locationId)
      findings.push("LOCATION MISMATCH");
  }
  return {
    productId: match.id,
    unitId: unit?.id ?? null,
    findings: findings.length ? findings : ["VALID ITEM"],
    payload,
  };
}
export function qrPayload(p: Product, unitId?: string) {
  return JSON.stringify({
    Item_ID: p.id,
    ...(unitId ? { Unit_ID: unitId } : {}),
    Item_Name: p.name,
    Price: p.price / 100,
    Intended_Location: p.locationId,
  });
}
export function markdownSuggestion(
  p: Product,
  units: Unit[],
  settings: { ageDays: number; sellThrough: number; discount: number },
  now = new Date(),
  opening = 0,
) {
  const age = Math.floor(
    (now.getTime() - new Date(p.introducedAt).getTime()) / 86400000,
  );
  const cohort = units.filter(
      (u) =>
        u.product_id === p.id && !["Offered", "In-Transit"].includes(u.status),
    ),
    sold = cohort.filter((u) => u.status === "Sold").length;
  const received = cohort.length + opening;
  const rate = received ? (sold / received) * 100 : null;
  if (!received || age < settings.ageDays)
    return {
      eligible: false,
      message: "Insufficient history",
      price: p.price,
      age,
      rate,
    };
  const price = Math.round(p.price * (1 - settings.discount / 100)),
    belowCost = p.cost !== null && price < p.cost;
  return {
    eligible: rate! < settings.sellThrough && !belowCost && price < p.price,
    message: belowCost
      ? "Below cost floor"
      : rate! < settings.sellThrough
        ? `${settings.discount}% markdown for manager review`
        : "Sell-through meets threshold",
    price,
    age,
    rate,
  };
}
export const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );
export const dateTime = (iso: string) =>
  new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Chicago",
  }).format(new Date(iso));
