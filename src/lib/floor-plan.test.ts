import { describe, expect, it } from "vitest";
import { groceryMaster } from "../../scripts/grocery-store";
import { getFloorPlan, measureFloorStock } from "./floor-plan";
import { seedMaster } from "./seed";
import type { Unit } from "./types";

const { master, lots } = groceryMaster(seedMaster, "2026-11-27");
const plan = getFloorPlan(master);
const opening = new Map(
  lots.map((lot) => [lot.product_id, { ...lot, remaining: lot.quantity }]),
);

describe("modeled supermarket floor", () => {
  it("allocates every variant within the facing and bay limits of its fixture", () => {
    expect(plan.byProduct.size).toBe(33_248);
    for (const department of plan.departments) {
      let assigned = 0;
      for (const aisle of department.aisles) {
        assigned += aisle.products.length;
        expect(aisle.bays).toBeLessThanOrEqual(department.fixture.baysPerAisle);
        expect(aisle.products.length).toBeLessThanOrEqual(
          aisle.bays * department.fixture.sides * department.variantsPerFace,
        );
        expect(aisle.lengthFeet).toBe(aisle.bays * 4);
        for (const product of aisle.products) {
          const address = plan.byProduct.get(product.id)!;
          expect(address.aisle).toBe(aisle.id);
          expect(address.bay).toBeLessThanOrEqual(aisle.bays);
          expect(address.level).toBeLessThanOrEqual(department.fixture.levels);
        }
      }
      expect(assigned).toBe(department.variants);
    }
    const beverages = plan.departments.find(
      (item) => item.name === "Beverages",
    )!;
    expect(beverages).toMatchObject({ bays: 117, shelfUnits: 37_240 });
    expect(beverages.aisles).toHaveLength(12);
    expect(beverages.floorArea).toBeGreaterThan(
      plan.departments.find((item) => item.name === "Produce & Floral")!
        .floorArea,
    );
  });
  it("reconciles live staging and off-home units without treating them as shelf stock", () => {
    const product = master.products.find((item) => item.id === "GR-300001")!;
    const otherRoom = master.locations.find(
      (location) => location.department === "Frozen Foods",
    )!;
    const staging: Unit = {
      id: "TEST-IN",
      product_id: product.id,
      status: "Pending Restock",
      current_location_id: null,
      destination_id: product.locationId,
      inspected: true,
      version: 1,
      created_at: "2026-11-27",
    };
    const offHome: Unit = {
      ...staging,
      id: "TEST-MOVED",
      status: "Restocked",
      current_location_id: otherRoom.id,
    };
    const stock = measureFloorStock(master, plan, [staging, offHome], opening);
    expect(stock.byDepartment.get("Beverages")).toEqual({
      shelf: 37_240,
      backstock: 125_636,
      staging: 1,
      onHand: 162_877,
    });
    expect(stock.byDepartment.get("Frozen Foods")).toMatchObject({
      onHand: 46_526,
      backstock: 34_891,
    });
    expect(
      stock.total.shelf + stock.total.backstock + stock.total.staging,
    ).toBe(stock.total.onHand);
  });
});
