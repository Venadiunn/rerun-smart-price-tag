import type { Location, Unit } from "./types";
import { locationLoad } from "./sorting";

export function storeSummary(locations: Location[], units: Unit[]) {
  const loads = locations.map((l) => ({ ...l, ...locationLoad(units, l.id) }));
  const capacity = loads.reduce((sum, l) => sum + (l.capacity ?? 0), 0);
  const placed = loads.reduce((sum, l) => sum + l.confirmed, 0);
  const reserved = loads.reduce((sum, l) => sum + l.reserved, 0);
  return {
    capacity,
    placed,
    reserved,
    available: loads.reduce(
      (sum, l) =>
        sum + (l.capacity === null ? 0 : Math.max(0, l.capacity - l.committed)),
      0,
    ),
    unlimited: loads.some((l) => l.capacity === null),
    loads,
  };
}

export function storeAisles(locations: Location[]) {
  const groups = new Map<string, Location[]>();
  for (const location of locations)
    groups.set(location.aisle, [
      ...(groups.get(location.aisle) ?? []),
      location,
    ]);
  return [...groups]
    .toSorted(([a], [b]) => a.localeCompare(b, "en", { numeric: true }))
    .map(([id, fixtures]) => ({
      id,
      label:
        [
          ...new Set(
            fixtures
              .map((l) => l.id.split("-Aisle-")[0])
              .filter((s) => s !== "Aisle-4-Shelf-B"),
          ),
        ].join(" / ") || "Footwear",
      fixtures: fixtures.toSorted((a, b) =>
        a.id.localeCompare(b.id, "en", { numeric: true }),
      ),
    }));
}
