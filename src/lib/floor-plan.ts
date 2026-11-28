import { isOnHand, type OpeningLot } from "./opening-stock";
import type { Master, Product, Unit } from "./types";

// Model assumptions, in inches unless stated. See docs/STORE-PLAN.md.
const bayWidth = 48;
const usableWidth = 44;
const walkFeet = 7;
const endClearanceFeet = 12;
const palletFootprint = (40 * 48) / 144;
const usablePalletVolume = 40 * 48 * 60 * 0.7;
const backroomRackFraction = 0.45;

interface Fixture {
  code: string;
  shortName: string;
  type: string;
  levels: number;
  depth: number;
  package: [width: number, depth: number, height: number];
  facings: number;
  sides: 1 | 2;
  baysPerAisle: number;
  storageTiers: number;
}
const fixtures: Record<string, Fixture> = {
  "Dry Grocery & Snacks": {
    code: "G1",
    shortName: "Dry grocery",
    type: "Gondolas",
    levels: 6,
    depth: 22,
    package: [3.25, 3.5, 6.5],
    facings: 1,
    sides: 2,
    baysPerAisle: 12,
    storageTiers: 3,
  },
  "Household, Health & Beauty": {
    code: "G2",
    shortName: "Household",
    type: "Gondolas",
    levels: 6,
    depth: 22,
    package: [4, 4.5, 7],
    facings: 1,
    sides: 2,
    baysPerAisle: 10,
    storageTiers: 3,
  },
  Beverages: {
    code: "G3",
    shortName: "Beverages",
    type: "Beverage shelves",
    levels: 5,
    depth: 24,
    package: [4.5, 6, 8],
    facings: 2,
    sides: 2,
    baysPerAisle: 10,
    storageTiers: 3,
  },
  "Dairy & Refrigerated": {
    code: "G4",
    shortName: "Dairy",
    type: "Refrigerated cases",
    levels: 5,
    depth: 26,
    package: [4, 4.5, 6.5],
    facings: 1,
    sides: 1,
    baysPerAisle: 12,
    storageTiers: 2,
  },
  "Frozen Foods": {
    code: "G5",
    shortName: "Frozen",
    type: "Freezer cases",
    levels: 5,
    depth: 26,
    package: [5, 5, 7],
    facings: 1,
    sides: 1,
    baysPerAisle: 12,
    storageTiers: 2,
  },
  "Produce & Floral": {
    code: "G6",
    shortName: "Produce",
    type: "Produce displays",
    levels: 3,
    depth: 30,
    package: [6, 5, 5],
    facings: 1,
    sides: 2,
    baysPerAisle: 8,
    storageTiers: 2,
  },
  "Meat, Seafood, Deli & Bakery": {
    code: "G7",
    shortName: "Fresh counter",
    type: "Service cases",
    levels: 4,
    depth: 28,
    package: [5, 5, 4],
    facings: 1,
    sides: 1,
    baysPerAisle: 10,
    storageTiers: 2,
  },
};
const defaultFixture = fixtures["Dry Grocery & Snacks"];
const idOrder = new Intl.Collator("en", { numeric: true });

export interface ShelfAddress {
  aisle: string;
  bay: number;
  side: "A" | "B";
  level: number;
}
export function shelfAddress(address: ShelfAddress) {
  return `Aisle ${address.aisle} · Bay ${address.bay} · Side ${address.side} · Shelf ${address.level}`;
}

interface FloorAisle {
  id: string;
  department: string;
  products: Product[];
  bays: number;
  shelfUnits: number;
  floorArea: number;
  lengthFeet: number;
}
interface FloorDepartment {
  name: string;
  fixture: Fixture;
  aisles: FloorAisle[];
  variants: number;
  bays: number;
  shelfUnits: number;
  floorArea: number;
  backroomArea: number;
  palletPositions: number;
  variantsPerFace: number;
  unitsPerVariant: number;
}
export interface FloorPlan {
  departments: FloorDepartment[];
  byAisle: Map<string, FloorAisle>;
  byProduct: Map<string, ShelfAddress>;
  salesArea: number;
  backroomArea: number;
  checkoutArea: number;
  aisleCount: number;
  bayCount: number;
}
const planCache = new WeakMap<Master, FloorPlan>();

export function getFloorPlan(master: Master): FloorPlan {
  const cached = planCache.get(master);
  if (cached) return cached;
  const names = [
    ...new Set(master.locations.map((location) => location.department)),
  ];
  const groups = new Map(
    names.map((name) => [name, { products: [] as Product[], capacity: 0 }]),
  );
  const locationDepartments = new Map(
    master.locations.map((location) => [location.id, location.department]),
  );
  for (const location of master.locations)
    groups.get(location.department)!.capacity += location.capacity ?? 0;
  for (const product of master.products) {
    const name = locationDepartments.get(product.locationId);
    if (name !== undefined) groups.get(name)?.products.push(product);
  }

  const byProduct = new Map<string, ShelfAddress>();
  const byAisle = new Map<string, FloorAisle>();
  const departments = [...groups].map(
    ([name, group], departmentIndex): FloorDepartment => {
      const fixture = Object.hasOwn(fixtures, name)
        ? fixtures[name]
        : {
            ...defaultFixture,
            code: `D${departmentIndex + 1}`,
            shortName: name,
          };
      const [packWidth, packDepth, packHeight] = fixture.package;
      const variantsPerLevel = Math.floor(
        usableWidth / (packWidth * fixture.facings),
      );
      const variantsPerFace = variantsPerLevel * fixture.levels;
      const variantsPerBay = variantsPerFace * fixture.sides;
      const variantsPerAisle = variantsPerBay * fixture.baysPerAisle;
      const unitsPerVariant =
        fixture.facings * Math.floor(fixture.depth / packDepth);
      const shelfUnits = group.products.length * unitsPerVariant;
      const unitsPerPallet = Math.floor(
        usablePalletVolume / (packWidth * packDepth * packHeight),
      );
      const palletPositions = Math.ceil(
        Math.max(0, group.capacity - shelfUnits) / unitsPerPallet,
      );
      const backroomArea = Math.ceil(
        (Math.ceil(palletPositions / fixture.storageTiers) * palletFootprint) /
          backroomRackFraction,
      );
      const aisles: FloorAisle[] = [];
      group.products.sort((a, b) => idOrder.compare(a.id, b.id));

      for (
        let offset = 0;
        offset < group.products.length;
        offset += variantsPerAisle
      ) {
        const id =
          fixture.code + "-" + String(aisles.length + 1).padStart(2, "0");
        const products = group.products.slice(
          offset,
          offset + variantsPerAisle,
        );
        const bays = Math.ceil(products.length / variantsPerBay);
        const lengthFeet = (bays * bayWidth) / 12;
        const floorArea = Math.ceil(
          (lengthFeet + endClearanceFeet) *
            (walkFeet + (fixture.sides * fixture.depth) / 12),
        );
        const aisle = {
          id,
          department: name,
          products,
          bays,
          lengthFeet,
          floorArea,
          shelfUnits: products.length * unitsPerVariant,
        };
        byAisle.set(id, aisle);
        aisles.push(aisle);
        products.forEach((product, i) => {
          byProduct.set(product.id, {
            aisle: id,
            bay: Math.floor(i / variantsPerBay) + 1,
            side: i % variantsPerBay >= variantsPerFace ? "B" : "A",
            level: Math.floor((i % variantsPerFace) / variantsPerLevel) + 1,
          });
        });
      }

      return {
        name,
        fixture,
        aisles,
        shelfUnits,
        palletPositions,
        backroomArea,
        variantsPerFace,
        unitsPerVariant,
        variants: group.products.length,
        bays: aisles.reduce((sum, a) => sum + a.bays, 0),
        floorArea: aisles.reduce((sum, a) => sum + a.floorArea, 0),
      };
    },
  );
  const salesArea = departments.reduce((sum, d) => sum + d.floorArea, 0);
  const plan = {
    departments,
    byAisle,
    byProduct,
    salesArea,
    backroomArea: departments.reduce((sum, d) => sum + d.backroomArea, 0),
    checkoutArea: Math.ceil(salesArea * 0.12),
    aisleCount: byAisle.size,
    bayCount: departments.reduce((sum, d) => sum + d.bays, 0),
  };
  planCache.set(master, plan);
  return plan;
}

interface StockSplit {
  onHand: number;
  shelf: number;
  backstock: number;
  staging: number;
}
const emptyStock = (): StockSplit => ({
  onHand: 0,
  shelf: 0,
  backstock: 0,
  staging: 0,
});

export function measureFloorStock(
  master: Master,
  plan: FloorPlan,
  units: Unit[],
  lots: Map<string, OpeningLot>,
) {
  const locationDepartments = new Map(
    master.locations.map((location) => [location.id, location.department]),
  );
  const byDepartment = new Map(
    plan.departments.map((department) => [department.name, emptyStock()]),
  );
  const byAisle = new Map(
    [...plan.byAisle.keys()].map((id) => [id, emptyStock()]),
  );
  const placedAtHome = new Map<string, number>();

  function count(
    productId: string,
    locationId: string,
    quantity: number,
    placed: boolean,
  ) {
    const department = locationDepartments.get(locationId);
    const stock =
      department === undefined ? undefined : byDepartment.get(department);
    if (!stock) return;
    stock.onHand += quantity;
    const address = plan.byProduct.get(productId);
    const aisle = address && plan.byAisle.get(address.aisle);
    const atHome =
      aisle && aisle.department === department
        ? byAisle.get(aisle.id)
        : undefined;
    if (atHome) atHome.onHand += quantity;
    if (placed && atHome) {
      placedAtHome.set(
        productId,
        (placedAtHome.get(productId) ?? 0) + quantity,
      );
    } else if (!placed) {
      stock.staging += quantity;
      if (atHome) atHome.staging += quantity;
    }
  }

  for (const lot of lots.values()) {
    if (lot.remaining)
      count(lot.product_id, lot.location_id, lot.remaining, true);
  }
  for (const unit of units) {
    if (isOnHand(unit))
      count(
        unit.product_id,
        unit.current_location_id ?? unit.destination_id,
        1,
        unit.current_location_id !== null,
      );
  }
  for (const department of plan.departments) {
    const stock = byDepartment.get(department.name)!;
    for (const aisle of department.aisles) {
      const aisleStock = byAisle.get(aisle.id)!;
      aisleStock.shelf = aisle.products.reduce(
        (sum, product) =>
          sum +
          Math.min(
            department.unitsPerVariant,
            placedAtHome.get(product.id) ?? 0,
          ),
        0,
      );
      aisleStock.backstock =
        aisleStock.onHand - aisleStock.staging - aisleStock.shelf;
      stock.shelf += aisleStock.shelf;
    }
    stock.backstock = stock.onHand - stock.staging - stock.shelf;
  }

  const total = emptyStock();
  for (const stock of byDepartment.values()) {
    total.onHand += stock.onHand;
    total.shelf += stock.shelf;
    total.backstock += stock.backstock;
    total.staging += stock.staging;
  }
  return { byDepartment, byAisle, total, placedAtHome };
}
