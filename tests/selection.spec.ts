import { test, expect } from "@playwright/test";
test.use({
  storageState:
    process.env.STAFF_STORAGE_STATE ?? ".private/administrator.state.json",
});

for (const theme of ["light", "dark"] as const)
  for (const width of [1440, 320]) {
    test(`labeled selection controls work at ${width}px in ${theme}`, async ({
      page,
    }) => {
      test.setTimeout(90000);
      await page.setViewportSize({ width, height: 1000 });
      await page.addInitScript(
        (value) => localStorage.setItem("rerun:appearance", value),
        theme,
      );
      await page.goto("/inventory");
      await page.getByLabel("Search inventory").fill("PROD-001");
      const open = page.getByRole("button", {
        name: "Open Premium Leather Boots",
        exact: true,
      });
      await expect(open).toHaveText("Open");
      await expect(page.locator(".product-cell button")).toHaveCount(0);
      await open.click();
      await expect(page.getByRole("dialog")).toContainText(
        "Premium Leather Boots",
      );
      await page.getByLabel("Close dialog").click();
      const unit = page.locator(".unit-card").first();
      if (await unit.count()) {
        await unit.getByRole("button", { name: /^Review unit / }).click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await page.getByLabel("Close dialog").click();
      }
      await page.goto("/tags");
      await page
        .locator(".tag-card")
        .first()
        .getByRole("button", { name: /^Manage / })
        .click();
      await expect(page.getByRole("dialog")).toContainText(
        "Assignment and recovery history",
      );
      await page.getByLabel("Close dialog").click();
      await page.goto("/locations");
      await page
        .getByRole("button", { name: /^Household, Health & Beauty/ })
        .click();
      const fixture = page.getByRole("button", {
        name: /^Select Electronics-Aisle-2-Shelf-A:/,
      });
      await expect(fixture).toContainText("Shelf-A");
      await fixture.click();
      await expect(
        page.getByRole("button", {
          name: /^Selected Electronics-Aisle-2-Shelf-A:/,
        }),
      ).toHaveAttribute("aria-pressed", "true");
      const assigned = page.getByRole("list", {
        name: "Assigned products",
        exact: true,
      });
      const view = assigned.getByRole("button", {
        name: /^View product: Wireless Earbuds Pro/,
      });
      await expect(view).toHaveText("View product");
      await view.click();
      await expect(page.getByRole("dialog")).toContainText(
        "Wireless Earbuds Pro",
      );
      await page.getByLabel("Close dialog").click();
      await page
        .getByRole("button", { name: "Capacity grid", exact: true })
        .click();
      const select = page.locator(".map-location").first().getByRole("button");
      await select.click();
      await expect(select).toHaveText("Selected");
      await expect(select).toHaveAttribute("aria-pressed", "true");
      expect(
        await select.evaluate((e) => {
          const range = document.createRange();
          range.selectNodeContents(e);
          return range.getClientRects().length;
        }),
      ).toBe(1);
      expect(
        await select.evaluate((e) => e.scrollWidth - e.clientWidth),
      ).toBeLessThanOrEqual(1);
      if (width === 320)
        await page.screenshot({
          path: `.private/selection-${theme}-phone.png`,
        });
      await page.goto("/");
      await page
        .locator(".queue-item")
        .first()
        .getByRole("button", { name: /^Review & place:/ })
        .click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.getByLabel("Close dialog").click();
      for (const route of ["/pricing", "/history", "/master", "/settings"]) {
        await page.goto(route);
        await page.locator("main h1").waitFor();
        expect(
          await page
            .locator("button button, button a, a button, button summary")
            .count(),
        ).toBe(0);
        const empty = await page
          .locator("button")
          .evaluateAll((buttons) =>
            buttons
              .filter(
                (b) =>
                  b.getClientRects().length &&
                  !b.textContent?.trim() &&
                  !b.querySelector("svg"),
              )
              .map((b) => b.getAttribute("aria-label")),
          );
        expect(empty).toEqual([]);
      }
      await page.goto("/history");
      const disclosure = page.locator("main summary").first();
      await expect(disclosure).toBeVisible();
      expect(
        await disclosure.evaluate((e) => getComputedStyle(e).borderTopStyle),
      ).toBe("solid");
      await disclosure.click();
      expect(
        await disclosure.evaluate(
          (e) => (e.parentElement as HTMLDetailsElement).open,
        ),
      ).toBe(true);
      await page.keyboard.press("Enter");
      expect(
        await disclosure.evaluate(
          (e) => (e.parentElement as HTMLDetailsElement).open,
        ),
      ).toBe(false);
    });
  }
