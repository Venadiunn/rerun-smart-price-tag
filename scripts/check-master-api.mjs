import fs from "node:fs/promises";
const session = JSON.parse(
  await fs.readFile(".private/admin-session.json", "utf8"),
);
const response = await fetch("http://localhost:5173/api/master", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.access_token}`,
  },
  body: JSON.stringify({
    action: "import",
    filename: "ReRun Master Inventory.xlsx",
    base64: (await fs.readFile("outputs/ReRun Master Inventory.xlsx")).toString(
      "base64",
    ),
  }),
});
const result = await response.json();
console.log(
  JSON.stringify({
    status: response.status,
    error: result.error,
    productCount: result.master?.products?.length,
  }),
);
