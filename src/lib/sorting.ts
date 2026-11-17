import type { Unit } from "./types";

export interface SortResult {
  ok: boolean;
  sorted: number;
  tagging?: {
    assigned: number;
    created: number;
    held: { unitId: string; reason: string }[];
  };
  routes: { unitId: string; productId: string; locationId: string }[];
  waiting: {
    unitId: string;
    productId: string;
    locationId: string;
    reason: string;
  }[];
}

export function locationLoad(units: Unit[], locationId: string) {
  const confirmed = units.filter(
    (u) => u.current_location_id === locationId,
  ).length;
  const reserved = units.filter(
    (u) =>
      u.status === "Pending Restock" &&
      u.destination_id === locationId &&
      u.current_location_id !== locationId,
  ).length;
  return { confirmed, reserved, committed: confirmed + reserved };
}

export function restockRoute(units: Unit[]) {
  return units
    .filter((u) => u.status === "Pending Restock")
    .toSorted(
      (a, b) =>
        a.destination_id.localeCompare(b.destination_id, "en", {
          numeric: true,
        }) ||
        a.product_id.localeCompare(b.product_id, "en", { numeric: true }) ||
        a.created_at.localeCompare(b.created_at) ||
        a.id.localeCompare(b.id),
    );
}
