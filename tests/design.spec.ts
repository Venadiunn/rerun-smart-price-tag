import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.use({ storageState: ".private/administrator.state.json" });
const routes = [
  ["/", "Overview"],
  ["/inventory", "Inventory"],
  ["/scan", "Scan & verify"],
  ["/locations", "Store locations"],
  ["/tags", "Reusable tags"],
  ["/pricing", "Pricing"],
  ["/history", "Activity history"],
  ["/master", "Master data"],
  ["/settings", "Settings"],
] as const;

for (const theme of ["light", "dark"] as const) {
  for (const width of [1440, 1024, 768, 390, 320]) {
    test(`${theme} workspace fits ${width}px across every route`, async ({
      page,
    }) => {
      test.setTimeout(120000);
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.setViewportSize({ width, height: width === 320 ? 640 : 1000 });
      await page.addInitScript(
        (value) => localStorage.setItem("rerun:appearance", value),
        theme,
      );
      for (const [route, title] of routes) {
        await page.goto(route);
        await expect(
          page.getByRole("heading", { name: title, exact: true, level: 1 }),
        ).toBeVisible();
        await expect(page.locator("html")).toHaveClass(
          theme === "dark" ? /dark/ : /^$/,
        );
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth - innerWidth,
          ),
          route,
        ).toBeLessThanOrEqual(1);
        await expect(page.locator('img[alt="ReRun"]:visible')).toHaveCount(1);
        if (width !== 320)
          await page.screenshot({
            path: `.private/design-${theme}-${width}-${route.slice(1) || "overview"}.png`,
            fullPage: true,
          });
        if (width === 1440) {
          const result = await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze();
          expect(
            result.violations.map((v) => ({
              id: v.id,
              nodes: v.nodes.map((n) => ({
                target: n.target,
                summary: n.failureSummary,
              })),
            })),
            route,
          ).toEqual([]);
        }
      }
      expect(errors).toEqual([]);
    });
  }
}

test("appearance and collapsed navigation persist, and system follows the device", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("heading", { name: "Overview", exact: true }).waitFor();
  await page.getByRole("button", { name: "Change appearance" }).first().click();
  await page.getByRole("menuitem", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("button", { name: "Toggle sidebar" }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Toggle sidebar" }),
  ).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("button", { name: "Change appearance" }).first().click();
  await page.getByRole("menuitem", { name: "System", exact: true }).click();
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveClass(/dark/);
});

test("phone drawer uses one logo, closes after navigation, and tabs support arrows", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await expect(page.locator('img[alt="ReRun"]:visible')).toHaveCount(1);
  await page
    .getByRole("link", { name: "Activity history", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Close navigation" }),
  ).toHaveCount(0);
  const activity = page.getByRole("tab", { name: /^Activity/ });
  await activity.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: /^Scan records/ })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("tab", { name: /^Scan records/ }),
  ).toHaveAttribute("aria-selected", "true");
});

test("master search edits the correct record and preserves checkbox form values", async ({
  page,
}) => {
  await page.goto("/master");
  await page.getByLabel("Search master records").fill("PROD-999");
  const row = page
    .getByRole("row")
    .filter({ has: page.getByText("PROD-999", { exact: true }) });
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Edit product",
    exact: true,
  });
  await expect(dialog.getByLabel("Id", { exact: true })).toHaveValue(
    "PROD-999",
  );
  const taxable = dialog.getByRole("checkbox");
  const originallyChecked = await taxable.isChecked();
  await taxable.setChecked(!originallyChecked);
  await dialog.getByRole("button", { name: /Stage/ }).click();
  await expect(
    page.getByRole("heading", { name: "Review 1 change", exact: true }),
  ).toBeVisible();
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("checkbox")).toBeChecked({
    checked: !originallyChecked,
  });
  await page.getByLabel("Close dialog").click();
  await page
    .getByRole("button", { name: "Discard draft", exact: true })
    .click();
});

test("overview receiving submits the existing inventory command", async ({
  page,
}) => {
  let received: unknown;
  await page.route("**/rest/v1/rpc/rerun_command", (route) => {
    received = route.request().postDataJSON();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Receive stock", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Receive stock",
    exact: true,
  });
  await dialog.getByRole("textbox", { name: "Find product" }).fill("PROD-999");
  await dialog
    .getByRole("combobox", { name: "Product", exact: true })
    .selectOption("PROD-999");
  await dialog
    .getByRole("combobox", { name: "Initial lifecycle", exact: true })
    .selectOption("Offered");
  await dialog.getByLabel("Quantity").fill("3");
  await dialog
    .getByRole("button", { name: "Receive units", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  expect(received).toMatchObject({
    cmd: "receive",
    args: { productId: "PROD-999", quantity: 3, status: "Offered" },
  });
});
