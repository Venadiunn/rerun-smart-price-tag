import { test, expect } from "@playwright/test";
test.use({
  storageState:
    process.env.STAFF_STORAGE_STATE ?? ".private/administrator.state.json",
});

test("proportional floor zones reconcile with stock and expose wheel-scrollable aisle details", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/locations");
  const zones = page.locator(".department-zone");
  await expect(zones).toHaveCount(7);
  const footprint = page.locator(".floor-diagram");
  const areas = await footprint.evaluate((plan) => {
    const bounds = (selector: string) =>
      plan.querySelector(selector)!.getBoundingClientRect();
    const sizes = (selector: string) => {
      const rect = bounds(selector);
      return rect.width * rect.height;
    };
    return {
      beverages: sizes('[data-zone="G3"]'),
      produce: sizes('[data-zone="G6"]'),
      receivingAboveAisles:
        bounds(".floor-backroom").bottom < bounds(".floor-departments").top,
      checkoutBelowAisles:
        bounds(".floor-checkout").top > bounds(".floor-departments").bottom,
      detailsBelowMap:
        document.querySelector(".destination-details")!.getBoundingClientRect()
          .top > plan.getBoundingClientRect().bottom,
    };
  });
  expect(areas.beverages / areas.produce).toBeGreaterThan(3);
  expect(areas.beverages / areas.produce).toBeLessThan(3.6);
  expect(
    areas.receivingAboveAisles &&
      areas.checkoutBelowAisles &&
      areas.detailsBelowMap,
  ).toBe(true);
  const dairy = zones.filter({
    has: page.locator("strong", { hasText: /^Dairy$/ }),
  });
  expect(
    await dairy.evaluate((zone) => {
      const box = zone.getBoundingClientRect();
      const label = zone.querySelector(".zone-label")!.getBoundingClientRect();
      return label.top >= box.top && label.bottom <= box.bottom;
    }),
  ).toBe(true);
  const summary = page.getByLabel("Store capacity summary");
  const totals = await summary.locator("strong").allTextContents();
  const number = (text: string) => Number(text.replaceAll(",", ""));
  const departments = await zones.locator("b").allTextContents();
  expect(departments.reduce((sum, value) => sum + number(value), 0)).toBe(
    number(totals[0]),
  );
  await expect(summary.locator("small").first()).toContainText(
    "33,248 product variants",
  );
  await page.getByRole("button", { name: "Beverages", exact: true }).click();
  const beveragePlan = page.getByRole("region", {
    name: "Beverages aisle plan",
  });
  await expect(beveragePlan).toContainText("37,240 planned positions");
  await expect(
    beveragePlan.getByRole("button", { name: /^Aisle G3-/ }),
  ).toHaveCount(12);
  await page.getByRole("button", { name: /^Aisle G3-01/ }).click();
  const details = page.getByRole("heading", {
    name: "Destination details",
    exact: true,
  });
  await expect(details).toBeFocused();
  await expect(details).toBeInViewport();
  const assigned = page.getByRole("list", { name: "Assigned products" });
  await expect(assigned).toContainText("Bay 1 · Side A · Shelf 1");
  const before = await page.evaluate(() => window.scrollY);
  const pointer = await assigned.getByRole("listitem").first().boundingBox();
  await page.mouse.move(pointer!.x + 20, pointer!.y + 10);
  await page.mouse.wheel(0, 1900);
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(before);
  await expect(
    page.getByRole("heading", {
      name: "Last confirmed placements",
      exact: true,
    }),
  ).toBeInViewport();
  expect(
    await page.locator(".destination-details").evaluate((panel) => ({
      maxHeight: getComputedStyle(panel).maxHeight,
      scrollTop: panel.scrollTop,
    })),
  ).toEqual({ maxHeight: "none", scrollTop: 0 });

  await page.getByRole("button", { name: "Back to store schematic" }).click();
  await expect(
    page.getByRole("heading", { name: "Store schematic" }),
  ).toBeFocused();
  await page.setViewportSize({ width: 320, height: 740 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
  ).toBeLessThanOrEqual(1);
  const key = page.getByRole("group", { name: "Department key" });
  const produce = key.getByRole("button", { name: "Choose Produce & Floral" });
  await expect(produce).toContainText("1,300 variants");
  await produce.click();
  await expect(
    page.getByRole("region", { name: "Produce & Floral aisle plan" }),
  ).toBeVisible();
  await page.goto("/inventory");
  await page.getByLabel("Search inventory").fill("TAG-GR-100001-1");
  await expect(page.locator(".product-cell")).toHaveCount(1);
  await expect(page.locator(".product-cell")).toContainText("GR-100001");
});
