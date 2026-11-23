import type { Snapshot, Unit } from "./types.js";
export interface OpeningLot {
  product_id: string;
  location_id: string;
  quantity: number;
  remaining: number;
}
export const isOnHand = (u: Unit) =>
  !["Sold", "Stocked Out", "Offered", "In-Transit"].includes(u.status);
export function stockIndex(lots: OpeningLot[]) {
  const byProduct = new Map<string, OpeningLot>(),
    byLocation: Record<string, number> = {};
  let total = 0;
  for (const lot of lots) {
    byProduct.set(lot.product_id, lot);
    byLocation[lot.location_id] =
      (byLocation[lot.location_id] ?? 0) + lot.remaining;
    total += lot.remaining;
  }
  return { byProduct, byLocation, total };
}
export function openingUnits(data: Snapshot, productId: string) {
  const lot = data.stock.byProduct.get(productId);
  if (!lot?.remaining) return [];
  const existing = new Set(
    data.units.filter((u) => u.product_id === productId).map((u) => u.id),
  );
  return Array.from(
    { length: lot.quantity },
    (_, i) => `UNIT-${productId}-${i + 1}`,
  ).filter((id) => !existing.has(id));
}
