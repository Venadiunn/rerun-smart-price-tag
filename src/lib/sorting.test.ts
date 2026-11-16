import { describe, expect, it } from "vitest";
import { locationLoad, restockRoute } from "./sorting";
import type { Unit } from "./types";

const unit = (
  id: string,
  product: string,
  dest: string,
  current: string | null = null,
  status: Unit["status"] = "Pending Restock",
): Unit => ({
  id,
  product_id: product,
  destination_id: dest,
  current_location_id: current,
  status,
  inspected: true,
  version: 1,
  created_at: "2026-11-16T12:00:00Z",
});
describe("store sorting", () => {
  it("counts relocation space in both locations and does not double count a unit", () => {
    const units = [
      unit("one", "P1", "A", "A"),
      unit("two", "P2", "B", "A"),
      unit("three", "P3", "A"),
      unit("four", "P4", "A", null, "Received in Store"),
    ];
    expect(locationLoad(units, "A")).toEqual({
      confirmed: 2,
      reserved: 1,
      committed: 3,
    });
    expect(locationLoad(units, "B")).toEqual({
      confirmed: 0,
      reserved: 1,
      committed: 1,
    });
  });
  it("groups a route by destination and product ID with stable unit ordering", () => {
    const units = [
      unit("z", "P10", "A2"),
      unit("b", "P2", "A2"),
      unit("a", "P2", "A2"),
      unit("c", "P1", "A10"),
      unit("d", "P1", "A1", null, "Sold"),
    ];
    expect(restockRoute(units).map((u) => u.id)).toEqual(["a", "b", "z", "c"]);
    expect(units[0].id).toBe("z");
  });
});
