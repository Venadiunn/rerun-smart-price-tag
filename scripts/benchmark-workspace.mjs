import fs from "node:fs";
import { performance } from "node:perf_hooks";
import { chromium, devices } from "@playwright/test";

const baseURL =
  process.env.BASE_URL ?? "https://rerun-smart-price-tag-psi.vercel.app";
const sessionFile =
  process.env.RUN_SESSION_STATE ?? ".private/administrator.state.json";
const repetitions = Number(process.env.BENCH_REPEATS ?? 3);
const state = JSON.parse(fs.readFileSync(sessionFile, "utf8"));
state.origins.forEach((origin) => {
  origin.origin = new URL(baseURL).origin;
});
const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome",
});
const profiles = [
  ["desktop", { viewport: { width: 1440, height: 900 } }],
  ["mobile", devices["Pixel 7"]],
  ["mobile-throttled", devices["Pixel 7"]],
];
const results = [];
const label = (url) => {
  const path = new URL(url).pathname;
  if (path.includes("/rpc/")) return path.split("/").pop();
  if (path.endsWith(".json.gz")) return "catalog";
  if (path.endsWith(".js") && path.includes("/assets/")) return "app-js";
  if (path.endsWith(".css") && path.includes("/assets/")) return "app-css";
  if (path.includes("speed-insights")) return "speed-insights";
  if (path === "/") return "document";
  return null;
};
try {
  for (const [profile, settings] of profiles) {
    if (process.env.BENCH_PROFILE && process.env.BENCH_PROFILE !== profile)
      continue;
    for (let sample = 1; sample <= repetitions; sample++) {
      const context = await browser.newContext({
        ...settings,
        baseURL,
        storageState: state,
      });
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send("Network.enable");
      if (profile === "mobile-throttled") {
        await cdp.send("Network.emulateNetworkConditions", {
          offline: false,
          latency: 150,
          downloadThroughput: (1600 * 1024) / 8,
          uploadThroughput: (750 * 1024) / 8,
        });
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      }
      await page.addInitScript(() => {
        globalThis.benchLongTasks = [];
        new PerformanceObserver((list) => {
          globalThis.benchLongTasks.push(
            ...list.getEntries().map((e) => Math.round(e.duration)),
          );
        }).observe({ type: "longtask", buffered: true });
      });
      const requests = new Map();
      cdp.on("Network.requestWillBeSent", (e) => {
        const key = label(e.request.url);
        if (key) requests.set(e.requestId, { key, start: e.timestamp });
      });
      cdp.on("Network.responseReceived", (e) => {
        const r = requests.get(e.requestId);
        if (r)
          Object.assign(r, {
            ttfb: Math.round((e.timestamp - r.start) * 1000),
            status: e.response.status,
          });
      });
      cdp.on("Network.loadingFinished", (e) => {
        const r = requests.get(e.requestId);
        if (r)
          Object.assign(r, {
            ms: Math.round((e.timestamp - r.start) * 1000),
            bytes: e.encodedDataLength,
          });
      });
      const measured = async (workflow, action) => {
        requests.clear();
        const start = performance.now();
        await action();
        const ms = Math.round(performance.now() - start);
        const navigation = workflow.includes("dashboard")
          ? await page.evaluate(() => ({
              longTasks: globalThis.benchLongTasks,
              documentTTFB: Math.round(
                performance.getEntriesByType("navigation")[0].responseStart,
              ),
            }))
          : {};
        const result = {
          profile,
          sample,
          workflow,
          ms,
          ...navigation,
          requests: [...requests.values()].map(({ start, ...r }) => r),
        };
        results.push(result);
        console.log(JSON.stringify(result));
      };
      try {
        const heading = (name) =>
          page
            .getByRole("heading", { level: 1, exact: true, name })
            .waitFor({ timeout: 60000 });
        await measured("cold dashboard", async () => {
          await page.goto("/", { waitUntil: "commit" });
          await heading("Overview");
        });
        for (const [name, route] of [
          ["Inventory", "/inventory"],
          ["Pricing", "/pricing"],
          ["Overview", "/"],
        ]) {
          if (
            await page
              .getByRole("button", { name: "Toggle navigation" })
              .isVisible()
          ) {
            await page
              .getByRole("button", { name: "Toggle navigation" })
              .click();
          }
          await measured("navigate " + route, async () => {
            await page.getByRole("link", { name, exact: true }).click();
            await heading(name);
          });
        }
        await measured("warm dashboard", async () => {
          await page.reload({ waitUntil: "commit" });
          await heading("Overview");
        });
      } catch (error) {
        const result = { profile, sample, error: String(error).split("\n")[0] };
        results.push(result);
        console.log(JSON.stringify(result));
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
}
if (process.env.BENCH_OUTPUT)
  fs.writeFileSync(process.env.BENCH_OUTPUT, JSON.stringify(results, null, 2));
