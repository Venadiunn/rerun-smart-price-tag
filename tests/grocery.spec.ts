import { test, expect } from "@playwright/test";
test.use({ storageState: ".private/administrator.state.json" });
test("seven grocery departments reconcile with store totals and grocery tag lookup", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/locations");
  const zones = page.locator(".department-zone");
  await expect(zones).toHaveCount(7);
  const layout = await page.locator(".grocery-plan").evaluate((plan) => {
    const bounds = (selector: string) =>
      plan.querySelector(selector)!.getBoundingClientRect().toJSON();
    return {
      household: bounds('[data-zone="household"]'),
      dairy: bounds('[data-zone="dairy"]'),
      frozen: bounds('[data-zone="frozen"]'),
      grocery: bounds('[data-zone="grocery"]'),
      beverages: bounds('[data-zone="beverages"]'),
      checkout: bounds(".store-checkout"),
      produce: bounds('[data-zone="produce"]'),
      fresh: bounds('[data-zone="fresh"]'),
      mapBottom: plan.closest(".panel")!.getBoundingClientRect().bottom,
      detailsTop: document
        .querySelector(".destination-details")!
        .getBoundingClientRect().top,
    };
  });
  expect(layout.dairy.left).toBeGreaterThan(layout.household.right);
  expect(layout.dairy.right).toBeLessThan(layout.frozen.left);
  expect(layout.dairy.bottom).toBeLessThan(layout.grocery.top);
  expect(layout.grocery.right).toBeLessThan(layout.beverages.left);
  expect(layout.checkout.top).toBeGreaterThan(layout.beverages.bottom);
  expect(layout.produce.bottom).toBe(layout.checkout.bottom);
  expect(layout.fresh.bottom).toBe(layout.checkout.bottom);
  expect(layout.detailsTop).toBeGreaterThan(layout.mapBottom);

  const summary = page.getByLabel("Store capacity summary");
  const totals = await summary.locator("strong").allTextContents();
  const departments = await zones.locator("b").allTextContents();
  const number = (s: string) => Number(s.replaceAll(",", ""));
  expect(departments.reduce((s, n) => s + number(n), 0)).toEqual(
    number(totals[0]),
  );
  await expect(summary.locator("small").first()).toContainText(
    "33,248 product variants",
  );
  await zones.filter({ hasText: "Produce & Floral" }).click();
  await expect(page.locator(".bay-section h3")).toHaveText("Produce & Floral");
  await page.locator(".bay-button").first().click();
  await expect(page.locator(".bay-button").first()).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const details = page.getByRole("heading", {
    name: "Destination details",
    exact: true,
  });
  await expect(details).toBeFocused();
  await expect(details).toBeInViewport();
  await page.getByRole("button", { name: "Back to store schematic" }).click();
  await expect(
    page.getByRole("heading", { name: "Store schematic" }),
  ).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
  ).toBeLessThanOrEqual(1);
  await page.goto("/inventory");
  await page.getByLabel("Search inventory").fill("TAG-GR-100001-1");
  await expect(page.locator(".product-cell")).toHaveCount(1);
  await expect(page.locator(".product-cell")).toContainText("GR-100001");
});
