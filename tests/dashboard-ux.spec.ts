import { test, expect } from "@playwright/test";
test.use({
  storageState:
    process.env.STAFF_STORAGE_STATE ?? ".private/administrator.state.json",
});
const routes = [
  "/",
  "/inventory",
  "/scan",
  "/locations",
  "/tags",
  "/pricing",
  "/history",
  "/master",
  "/settings",
];
for (const width of [1440, 320])
  test(`controls remain usable at ${width}px`, async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: 1000 });
    for (const route of routes) {
      await page.goto(route);
      await page.locator("main h1").waitFor();
      const failures = await page.locator("main").evaluate((main) =>
        [
          ...main.querySelectorAll<HTMLElement>(
            '[data-slot="button"],[data-slot="tabs-trigger"],input:not([type=hidden]),select,summary',
          ),
        ]
          .filter(
            (e) =>
              e.getClientRects().length && e.getBoundingClientRect().height > 0,
          )
          .flatMap((e) => {
            const r = e.getBoundingClientRect();
            const min =
              innerWidth < 768 || e.dataset.size === "default" ? 44 : 40;
            return r.height < min - 1 ||
              r.width < 24 ||
              e.scrollHeight > e.clientHeight + 2
              ? [
                  {
                    text: e.textContent?.slice(0, 50),
                    height: r.height,
                    width: r.width,
                    clipped: e.scrollHeight - e.clientHeight,
                  },
                ]
              : [];
          }),
      );
      expect(failures, route).toEqual([]);
    }
  });
for (const width of [1440, 390])
  test(`text enlargement and spacing preserve content at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: 1000 });
    for (const route of routes) {
      await page.goto(route);
      await page.locator("main h1").waitFor();
      await page.addStyleTag({
        content:
          "html {font-size: 200% !important} main * {line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important} main p {margin-bottom: 2em !important}",
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - innerWidth,
        ),
        route,
      ).toBeLessThanOrEqual(1);
      const clipped = await page.locator("main").evaluate((main) =>
        [
          ...main.querySelectorAll<HTMLElement>(
            'h1,h2,h3,p,strong,small,label,[data-slot="button"],[data-slot="tabs-trigger"]',
          ),
        ]
          .filter(
            (e) =>
              e.getClientRects().length &&
              e.clientHeight &&
              e.clientWidth &&
              (e.scrollHeight - e.clientHeight > 2 ||
                e.scrollWidth - e.clientWidth > 2),
          )
          .map((e) => ({
            text: e.textContent?.slice(0, 55),
            className: e.className,
            dx: e.scrollWidth - e.clientWidth,
            dy: e.scrollHeight - e.clientHeight,
          })),
      );
      expect(clipped, route).toEqual([]);
    }
  });
test("refresh failure preserves loaded data and refresh recovers", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("heading", { name: "Overview", exact: true }).waitFor();
  const timestamp = page.locator(".workspace-freshness time");
  await expect(timestamp).toHaveAttribute("datetime", /^\d{4}-/);
  await page.route("**/rpc/rerun_snapshot", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "Test refresh unavailable" }),
    }),
  );
  await page.getByRole("button", { name: "Refresh data", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "The latest refresh failed",
  );
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  await page.unroute("**/rpc/rerun_snapshot");
  await page.getByRole("button", { name: "Refresh data", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("phone location selection opens details and returns to the schematic", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/locations");
  await page
    .getByRole("button", { name: /^Select Electronics-Aisle-2-Shelf-A:/ })
    .click();
  const details = page.getByRole("heading", {
    name: "Destination details",
    exact: true,
  });
  await expect(details).toBeFocused();
  await expect(details).toBeInViewport();
  await page
    .getByRole("button", { name: "Back to store schematic", exact: true })
    .click();
  const schematic = page.getByRole("heading", {
    name: "Store schematic",
    exact: true,
  });
  await expect(schematic).toBeFocused();
  await expect(schematic).toBeInViewport();
});

test("refresh access errors block the cached workspace until recovery", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("heading", { name: "Overview", exact: true }).waitFor();
  for (const [status, code, message] of [
    [401, "PGRST301", "JWT expired"],
    [403, "42501", "Permission denied"],
    [400, "P0001", "Staff access required"],
  ] as const) {
    await page.route("**/rpc/rerun_snapshot", (route) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify({ code, message }),
      }),
    );
    await page
      .getByRole("button", { name: "Refresh data", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Workspace unavailable", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Overview", exact: true }),
    ).toHaveCount(0);
    await page.unroute("**/rpc/rerun_snapshot");
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Overview", exact: true }),
    ).toBeVisible();
  }
});
