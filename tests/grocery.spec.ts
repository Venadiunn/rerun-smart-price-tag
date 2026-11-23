import { test, expect } from "@playwright/test";
test.use({ storageState: ".private/administrator.state.json" });
test("seven grocery departments reconcile with store totals and grocery tag lookup", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.goto("/locations");
  const zones = page.locator(".department-zone");
  await expect(zones).toHaveCount(7);
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
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
  ).toBeLessThanOrEqual(1);
  await page.goto("/inventory");
  await page.getByLabel("Search inventory").fill("TAG-GR-100001-1");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody")).toContainText("GR-100001");
});
