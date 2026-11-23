import fs from "node:fs";
import { performance } from "node:perf_hooks";
import { createClient } from "@supabase/supabase-js";
import { chromium, devices, expect } from "@playwright/test";
if (process.env.BENCH_WRITE !== "1")
  throw Error("Set BENCH_WRITE=1 to record a test price request and revision.");
const baseURL =
  process.env.BASE_URL ?? "https://rerun-smart-price-tag-psi.vercel.app";
const state = JSON.parse(
  fs.readFileSync(
    process.env.RUN_SESSION_STATE ?? ".private/administrator.state.json",
    "utf8",
  ),
);
state.origins.forEach((o) => (o.origin = baseURL));
const token = JSON.parse(
  state.origins[0].localStorage.find((x) => x.name.endsWith("auth-token"))
    .value,
).access_token;
const sb = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  {
    global: { headers: { Authorization: "Bearer " + token } },
    auth: { persistSession: false },
  },
);
const sku = process.env.BENCH_PRICE_PRODUCT ?? "GR-700999";
if (!/^GR-[1-7]\d{5}$/.test(sku))
  throw Error("Choose a generated grocery SKU for this benchmark.");
const product = await sb.from("products").select("data").eq("id", sku).single();
if (product.error) throw product.error;
const current = product.data.data.price;
const price = current + Number(process.env.BENCH_PRICE_DELTA ?? 0);
const reason = "ReRun performance verification " + Date.now();
const req = await sb.rpc("rerun_command", {
  cmd: "price_request",
  args: { productId: sku, price, reason },
  request_id: crypto.randomUUID(),
});
if (req.error) throw req.error;
const requestId = req.data.id;
const mobile = process.env.BENCH_PRICE_MOBILE === "1";
const browser = await chromium.launch({ channel: "chrome" });
try {
  const ctx = await browser.newContext({
    ...(mobile
      ? devices["Pixel 7"]
      : { viewport: { width: 1440, height: 900 } }),
    baseURL,
    storageState: state,
  });
  const page = await ctx.newPage();
  if (mobile) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 150,
      downloadThroughput: (1600 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  }
  await page.goto("/pricing");
  const row = page.getByRole("row").filter({ hasText: reason });
  await expect(row).toBeVisible({ timeout: 60000 });
  const button = row.getByRole("button", { name: "Approve & publish" });
  const pending = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      /\/api\/master$|\/rpc\/rerun_approve_price$/.test(r.url()),
    { timeout: 120000 },
  );
  const start = performance.now();
  await button.click();
  const response = await pending;
  const bytes = Buffer.byteLength(response.request().postData() ?? "");
  const responseMs = Math.round(performance.now() - start);
  console.log(
    JSON.stringify({
      mobile,
      responseMs,
      status: response.status(),
      bytes,
      timing: response.headers()["server-timing"],
      region: response.headers()["x-vercel-id"]?.split("::").slice(0, -1),
    }),
  );
  if (!response.ok()) throw Error(JSON.stringify(await response.json()));
  await expect(row.getByText("Approved", { exact: true })).toBeVisible({
    timeout: 90000,
  });
  const appliedMs = Math.round(performance.now() - start);
  if (await page.getByRole("button", { name: "Toggle navigation" }).isVisible())
    await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page.getByRole("link", { name: "Inventory", exact: true }).click();
  await page.getByLabel("Search inventory").fill(sku);
  await expect(page.locator("tbody tr").filter({ hasText: sku })).toContainText(
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(price / 100),
  );
  console.log(
    JSON.stringify({ mobile, appliedMs, verifiedInventory: true, price }),
  );
} finally {
  await browser.close();
  const row = await sb
    .from("price_requests")
    .select("version,status")
    .eq("id", requestId)
    .single();
  if (row.data?.status === "Pending")
    await sb.rpc("rerun_command", {
      cmd: "price_reject",
      args: { id: requestId, version: row.data.version },
      request_id: crypto.randomUUID(),
    });
}
