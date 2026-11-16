import fs from "node:fs/promises";
import { readWorkbook } from "../server-lib/workbook.js";
import { seedMaster } from "../src/lib/seed.js";
const master = await readWorkbook(
  await fs.readFile("outputs/ReRun Master Inventory.xlsx"),
  "master.xlsx",
  seedMaster,
);
console.log(
  "Validated artifact workbook:",
  master.master.products.length,
  "products",
  master.revision,
);
