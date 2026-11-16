import fs from "node:fs/promises";
const inventory = "src/pages/Inventory.tsx";
let text = await fs.readFile(inventory, "utf8");
text = text.replace(
  "quantity:Number(f.get('quantity'))}",
  "quantity:Number(f.get('quantity')),status:field(f,'initialStatus')}",
);
text = text.replace(
  '<label>Quantity<input type="number" name="quantity"',
  '<label>Initial lifecycle<select name="initialStatus"><option>Received in Store</option><option>Offered</option><option>In-Transit</option></select></label><label>Quantity<input type="number" name="quantity"',
);
await fs.writeFile(inventory, text);
const dashboard = "src/pages/Dashboard.tsx";
text = await fs.readFile(dashboard, "utf8");
text = text.replace(
  "!['Sold','Stocked Out'].includes(u.status)",
  "!['Sold','Stocked Out','Offered','In-Transit'].includes(u.status)",
);
await fs.writeFile(dashboard, text);
const pricing = "src/pages/Pricing.tsx";
text = await fs.readFile(pricing, "utf8");
text = text.replace(
  "all recorded units for that product",
  "all received units for that product (including returns and stock-outs)",
);
await fs.writeFile(pricing, text);
