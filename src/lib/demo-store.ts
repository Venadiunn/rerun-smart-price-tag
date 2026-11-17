import { validateMaster } from "./domain";
import type { Master } from "./types";

// Fictional styles. The catalog holds variants; stock remains separate unit records.
const styles: Record<string, string[]> = {
  Clothing: [
    "Harbor Oxford Shirt",
    "Summit Cotton Tee",
    "Meadow Linen Blouse",
    "Juniper Knit Polo",
    "Ridge Fleece Hoodie",
    "Cedar Zip Cardigan",
    "Atlas Denim Jacket",
    "Willow Midi Dress",
    "Brook Pleated Skirt",
    "Canyon Cargo Pants",
    "Coast Stretch Chinos",
    "Forest Trail Shorts",
    "Alpine Merino Sweater",
    "Metro Wool Overcoat",
    "Prairie Cotton Joggers",
    "Harbor Canvas Trainers",
    "Summit Trail Runners",
    "Meadow Leather Loafers",
    "Juniper Chelsea Boots",
    "Ridge Hiking Boots",
    "Cedar Slide Sandals",
    "Atlas Court Sneakers",
  ],
  Electronics: [
    "Harbor Studio Headphones",
    "Summit Wireless Earbuds",
    "Meadow Portable Speaker",
    "Juniper Desktop Speaker",
    "Ridge Compact Radio",
    "Cedar Alarm Clock",
    "Atlas USB Microphone",
    "Willow Webcam",
    "Brook Wireless Mouse",
    "Canyon Compact Keyboard",
    "Coast Trackpad",
    "Forest Drawing Tablet",
    "Alpine USB Hub",
    "Metro Laptop Stand",
    "Prairie Charging Dock",
    "Harbor Power Bank",
    "Summit Wireless Charger",
    "Meadow Smart Plug",
    "Juniper Reading Light",
    "Ridge Desk Fan",
    "Cedar Digital Timer",
    "Atlas Cable Organizer",
  ],
  Home: [
    "Harbor Stoneware Bowl",
    "Summit Dinner Plate",
    "Meadow Coffee Mug",
    "Juniper Water Bottle",
    "Ridge Food Container",
    "Cedar Serving Tray",
    "Atlas Mixing Bowl",
    "Willow Glass Carafe",
    "Brook Tea Canister",
    "Canyon Dish Towel",
    "Coast Bath Sheet",
    "Forest Hand Towel",
    "Alpine Throw Blanket",
    "Metro Cushion Cover",
    "Prairie Table Runner",
    "Harbor Storage Basket",
    "Summit Ceramic Vase",
    "Meadow Planter",
    "Juniper Candle Holder",
    "Ridge Desk Organizer",
    "Cedar Picture Frame",
    "Atlas Laundry Hamper",
  ],
  Accessories: [
    "Harbor Weekend Tote",
    "Summit Travel Backpack",
    "Meadow Crossbody Satchel",
    "Juniper Mini Shoulder Bag",
    "Ridge Duffel Bag",
    "Cedar Laptop Sleeve",
    "Atlas Tablet Pouch",
    "Willow Travel Wallet",
    "Brook Card Holder",
    "Canyon Coin Purse",
    "Coast Key Organizer",
    "Forest Passport Cover",
    "Alpine Knit Beanie",
    "Metro Baseball Cap",
    "Prairie Bucket Hat",
    "Harbor Woven Belt",
    "Summit Cotton Scarf",
    "Meadow Wool Gloves",
    "Juniper Sunglasses Case",
    "Ridge Watch Strap",
    "Cedar Packing Cube",
    "Atlas Toiletry Bag",
  ],
};
const colors = [
  "Black",
  "Navy",
  "Stone",
  "Olive",
  "Burgundy",
  "Sky Blue",
  "Sand",
  "Cream",
  "Charcoal",
];

export function expandDemoStore(input: Master, introducedAt: string): Master {
  if (input.products.length > 1000)
    throw new Error("Catalog already exceeds the 1,000-product demo target.");
  if (
    input.locations.length !== 16 ||
    !input.locations.some((l) => l.id === "Clothing-Aisle-1-Rack-D")
  )
    throw new Error("Expected the existing 16-location ReRun store layout.");
  const master = structuredClone(input);
  master.locations = master.locations.map((l) => ({
    ...l,
    capacity: l.id === "Clothing-Aisle-1-Rack-D" ? 50 : 30,
  }));
  const existingNames = new Set(master.products.map((p) => p.name));
  const ids = new Set(master.products.map((p) => p.id));
  const aliases = new Set(
    master.products.flatMap((p) => [p.sku, p.barcode]).filter(Boolean),
  );
  let nextId =
    Math.max(
      0,
      ...master.products.map((p) =>
        Number(p.id.match(/^PROD-(\d+)$/)?.[1] ?? 0),
      ),
    ) + 1;
  for (const [categoryId, names] of Object.entries(styles)) {
    if (!master.categories.some((c) => c.id === categoryId))
      throw new Error(`Missing demo category: ${categoryId}`);
    for (let style = 0; style < names.length; style++)
      for (let variant = 0; variant < 9; variant++) {
        if (master.products.length === 1000) return validateMaster(master);
        const footwear = categoryId === "Clothing" && style >= 15;
        const wearable = categoryId === "Clothing";
        const size = wearable
          ? (footwear ? ["US 7", "US 8", "US 9"] : ["S", "M", "L"])[variant % 3]
          : "One size";
        const color = colors[wearable ? Math.floor(variant / 3) : variant];
        const name = `${names[style]} / ${color} / ${size}`;
        if (existingNames.has(name)) continue;
        const departmentCode =
          categoryId === "Clothing"
            ? "DEPT-01"
            : categoryId === "Electronics"
              ? "DEPT-02"
              : categoryId === "Home"
                ? "DEPT-03"
                : "DEPT-04";
        const homes = master.locations.filter((l) =>
          categoryId === "Clothing"
            ? footwear
              ? ["Aisle-4", "Aisle-5"].includes(l.aisle)
              : l.aisle === "Aisle-1"
            : l.department === departmentCode,
        );
        if (!homes.length)
          throw new Error(`Missing locations for ${categoryId}`);
        while (
          ids.has(`PROD-${String(nextId).padStart(3, "0")}`) ||
          aliases.has(`RR-MOCK-${String(nextId).padStart(6, "0")}`) ||
          aliases.has(`RR-CATALOG-${nextId}`)
        )
          nextId++;
        const id = `PROD-${String(nextId).padStart(3, "0")}`,
          sku = `RR-CATALOG-${nextId}`,
          barcode = `RR-MOCK-${String(nextId).padStart(6, "0")}`;
        const price =
          (categoryId === "Electronics"
            ? 2499
            : categoryId === "Home"
              ? 1299
              : 1999) +
          style * 200 +
          (variant % 3) * 100;
        master.products.push({
          id,
          sku,
          barcode,
          name,
          price,
          cost: Math.round(price * 0.55),
          categoryId,
          subcategory: footwear
            ? "Footwear"
            : categoryId === "Clothing"
              ? "Apparel"
              : categoryId,
          classification: names[style],
          supplierId: `MOCK-${departmentCode}`,
          departmentCode,
          taxable: true,
          size,
          color,
          locationId: homes[style % homes.length].id,
          introducedAt,
        });
        ids.add(id);
        aliases.add(sku);
        aliases.add(barcode);
        existingNames.add(name);
        nextId++;
      }
  }
  if (master.products.length !== 1000)
    throw new Error(
      "The style library could not fill this catalog without duplicating existing variants.",
    );
  return validateMaster(master);
}
