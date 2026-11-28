import { validateMaster } from "../src/lib/domain";
import type { Master, Product } from "../src/lib/types";

// Assortment and unit ranges come from the supplied store brief.
export const departments = [
  [
    "Dry Grocery & Snacks",
    13964,
    18,
    32,
    "Pasta|Brown rice|Rolled oats|Corn flakes|Black beans|Chickpeas|Tomato sauce|Olive oil|Peanut butter|Pretzels|Rice crackers|Tortilla chips|Granola|Baking flour|Cocoa|Canned tomatoes",
  ],
  [
    "Household, Health & Beauty",
    7315,
    10,
    20,
    "Dish soap|Shampoo|Toothpaste|Laundry detergent|Facial tissue|Paper towels|Hand soap|Pet food|Body lotion|Kitchen sponges|Deodorant|Conditioner",
  ],
  [
    "Beverages",
    4655,
    25,
    45,
    "Sparkling water|Orange juice|Iced tea|Ground coffee|Apple juice|Ginger ale|Lemonade|Grape juice|Mineral water|Cola",
  ],
  [
    "Dairy & Refrigerated",
    2660,
    20,
    35,
    "Milk|Greek yogurt|Cheddar|Butter|Cottage cheese|Cream cheese|Eggs|Sour cream",
  ],
  [
    "Frozen Foods",
    2327,
    15,
    25,
    "Frozen peas|Thin crust pizza|Vanilla ice cream|Frozen blueberries|Waffles|Spinach ravioli|Frozen corn|Vegetable stir fry",
  ],
  [
    "Produce & Floral",
    1300,
    15,
    30,
    "Gala apples|Pears|Baby carrots|Romaine lettuce|Avocados|Navel oranges|Cherry tomatoes|Broccoli|Cut flowers|Fresh basil",
  ],
  [
    "Meat, Seafood, Deli & Bakery",
    1027,
    15,
    30,
    "Chicken breast|Ground turkey|Salmon fillets|Sliced ham|Roast beef|Sourdough bread|Bagels|Dinner rolls|Shrimp|Croissants",
  ],
] as const;
export function groceryMaster(previous: Master, date: string) {
  if (previous.products.some((p) => p.id.startsWith("GR-")))
    throw Error("Grocery catalog already exists.");
  const household = departments[1][0];
  const products: Product[] = previous.products.map((p) => ({
    ...p,
    categoryId: household,
    departmentCode: "G2",
  }));
  const locations: Master["locations"] = previous.locations.map((l) => ({
    ...l,
    department: household,
  }));
  const lots: { product_id: string; location_id: string; quantity: number }[] =
    [];
  const brands = [
    "Alder",
    "Birch",
    "Cedar",
    "Elm",
    "Grove",
    "Maple",
    "Oak",
    "Pine",
    "Willow",
    "Laurel",
    "Clover",
    "Orchard",
  ];
  for (const [
    d,
    [department, total, low, high, families],
  ] of departments.entries()) {
    const names = families.split("|");
    const count = total - (d === 1 ? previous.products.length : 0);
    if (count <= 0)
      throw Error("Existing non-food catalog exceeds assortment.");
    const zones = Array.from({ length: d === 0 ? 8 : 3 }, (_, i) => ({
      id: `G${d + 1}-BAY-${i + 1}`,
      department,
      aisle: `Aisle ${d + 1}`,
      rack: `Bay ${i + 1}`,
      shelf: "",
      capacity: 100,
    }));
    for (let i = 0; i < count; i++) {
      const id = `GR-${d + 1}${String(i + 1).padStart(5, "0")}`;
      const family = names[i % names.length],
        line = Math.floor(i / names.length),
        brand = brands[line % brands.length];
      const size = `${1 + (Math.floor(line / brands.length) % 8)} pack`;
      const assortment = Math.floor(line / (8 * brands.length)) + 1;
      const zone = zones[i % zones.length],
        quantity = low + (i % (high - low + 1));
      zone.capacity += quantity;
      lots.push({ product_id: id, location_id: zone.id, quantity });
      const price = 129 + 25 * (i % 40);
      products.push({
        id,
        sku: `SKU-${id}`,
        barcode: `29${id.slice(3)}0000`,
        name: `${brand} ${family} · ${size} · Series ${assortment}`,
        categoryId: department,
        departmentCode: `G${d + 1}`,
        locationId: zone.id,
        price,
        cost: Math.floor(price * 0.65),
        size,
        color: "",
        subcategory: family,
        classification: department,
        supplierId: `SUP-${brand}`,
        taxable: d === 1,
        introducedAt: date,
      });
    }
    for (const zone of zones)
      zone.capacity =
        Math.ceil((zone.capacity * (1.12 + d * 0.012)) / 100) * 100;
    locations.push(...zones);
  }
  return {
    master: validateMaster({
      products,
      locations,
      categories: departments.map(([id]) => ({ id, name: id })),
    }),
    lots,
  };
}
