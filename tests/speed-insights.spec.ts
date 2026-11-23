import { test, expect } from "@playwright/test";

test.use({
  storageState:
    process.env.STAFF_STORAGE_STATE ?? ".private/administrator.state.json",
});

test("signed-in workspace initializes one performance script and follows SPA routes", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("heading", { name: "Overview", exact: true }).waitFor();
  const script = page.locator(
    'head script[data-sdkn="@vercel/speed-insights/react"]',
  );
  await expect(script).toHaveCount(1);
  await expect(script).toHaveAttribute("data-route", "/");
  const initialDocument = await page.evaluate(() => performance.timeOrigin);
  for (const [label, route] of [
    ["Inventory", "/inventory"],
    ["Master data", "/master"],
    ["Activity history", "/history"],
  ]) {
    await page.getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(route + "$"));
    await expect(script).toHaveAttribute("data-route", route);
    await expect(script).toHaveCount(1);
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(
      initialDocument,
    );
  }
});

test("sign-in and activation pages do not initialize workspace performance tracking", async ({
  browser,
}) => {
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();
  for (const path of ["/", "/activate"]) {
    await page.goto(new URL(path, test.info().project.use.baseURL).href);
    await page.locator("h1").waitFor();
    await expect(
      page.locator('script[data-sdkn^="@vercel/speed-insights"]'),
    ).toHaveCount(0);
  }
  await context.close();
});
