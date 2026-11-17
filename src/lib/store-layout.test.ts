import { describe, expect, it } from "vitest";
import { storeAisles, storeSummary } from "./store-layout";
import type { Location, Unit } from "./types";

const location = (
  id: string,
  aisle: string,
  capacity: number | null,
): Location => ({
  id,
  aisle,
  capacity,
  department: "Clothing",
  rack: "Rack-A",
  shelf: "",
});
const unit = (
  id: string,
  current: string | null,
  destination: string,
  status: Unit["status"],
): Unit => ({
  id,
  product_id: "P1",
  current_location_id: current,
  destination_id: destination,
  status,
  inspected: true,
  version: 1,
  created_at: "2026-11-16",
});
describe("store visualization", () => {
  it("keeps recorded placement separate from reserved destination space", () => {
    const summary = storeSummary(
      [location("A", "Aisle-1", 30), location("B", "Aisle-2", 50)],
      [
        unit("1", "A", "B", "Pending Restock"),
        unit("2", "B", "B", "Restocked"),
        unit("3", null, "A", "Received in Store"),
      ],
    );
    expect(summary).toMatchObject({
      capacity: 80,
      placed: 2,
      reserved: 1,
      available: 77,
      unlimited: false,
    });
  });
  it("does not show negative available capacity or treat unlimited as a finite fixture", () => {
    const summary = storeSummary(
      [location("A", "Aisle-1", 1), location("B", "Aisle-2", null)],
      [unit("1", "A", "A", "Restocked"), unit("2", "A", "A", "Restocked")],
    );
    expect(summary.available).toBe(0);
    expect(summary.unlimited).toBe(true);
  });
  it("groups fixtures into numerically ordered aisles without changing the input", () => {
    const locations = [
      location("Home-Aisle-10-Shelf-A", "Aisle-10", 30),
      location("Clothing-Aisle-2-Rack-A", "Aisle-2", 30),
    ];
    expect(storeAisles(locations).map((a) => a.id)).toEqual([
      "Aisle-2",
      "Aisle-10",
    ]);
    expect(locations[0].aisle).toBe("Aisle-10");
  });
});
