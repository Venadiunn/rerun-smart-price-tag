import { describe, expect, it } from "vitest";
import { expandDemoStore } from "./demo-store";
import { seedMaster } from "./seed";

const baseline = () => ({
  ...seedMaster,
  products: Array.from({ length: 208 }, (_, i) => ({
    ...seedMaster.products[i % 8],
    id: `PROD-${String(i + 1).padStart(3, "0")}`,
    sku: `BASE-${i + 1}`,
    barcode: `BASE-CODE-${i + 1}`,
    name: `Existing catalog product ${i + 1}`,
  })),
  locations: [
    ...seedMaster.locations,
    ...seedMaster.locations.map((l, i) => ({
      ...l,
      id: i === 0 ? "Clothing-Aisle-1-Rack-D" : `${l.id}-Expansion`,
      capacity: 25,
    })),
  ],
});
describe("expanded mock store", () => {
  it("creates 1,000 unique products and exactly 500 slots while preserving existing products", () => {
    const original = baseline();
    const result = expandDemoStore(original, "2026-11-16");
    expect(result.products).toHaveLength(1000);
    expect(new Set(result.products.map((p) => p.id)).size).toBe(1000);
    expect(new Set(result.products.map((p) => p.name)).size).toBe(1000);
    expect(new Set(result.products.map((p) => p.sku)).size).toBe(1000);
    expect(new Set(result.products.map((p) => p.barcode)).size).toBe(1000);
    expect(result.locations.reduce((n, l) => n + l.capacity!, 0)).toBe(500);
    expect(result.products.slice(0, original.products.length)).toEqual(
      original.products,
    );
    expect(original.products).toHaveLength(208);
    expect(
      result.products.every((p) =>
        result.locations.some((l) => l.id === p.locationId),
      ),
    ).toBe(true);
    expect(expandDemoStore(result, "2026-11-16")).toEqual(result);
  });
  it("rejects incompatible layouts instead of deleting data", () => {
    expect(() => expandDemoStore(seedMaster, "2026-11-16")).toThrow(
      "16-location",
    );
  });
});
