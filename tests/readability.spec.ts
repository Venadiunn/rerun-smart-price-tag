import { test, expect } from "@playwright/test";
test.use({
  storageState:
    process.env.STAFF_STORAGE_STATE ?? ".private/administrator.state.json",
});

for (const theme of ["light", "dark"] as const)
  for (const width of [1440, 320]) {
    test(`screen text remains readable at ${width}px in ${theme}`, async ({
      page,
    }) => {
      test.setTimeout(90000);
      await page.setViewportSize({ width, height: 1000 });
      await page.addInitScript(
        (value) => localStorage.setItem("rerun:appearance", value),
        theme,
      );
      for (const route of [
        "/",
        "/inventory",
        "/scan",
        "/locations",
        "/tags",
        "/pricing",
        "/history",
        "/master",
        "/settings",
      ]) {
        await page.goto(route);
        await page.locator("main h1").waitFor();
        const failures = await page.locator("main").evaluate((main) =>
          [
            ...main.querySelectorAll<HTMLElement>(
              'h1,h2,h3,p,strong,small,label,[data-slot="item-title"],[data-slot="item-description"]',
            ),
          ]
            .filter((e) => {
              if (
                !e.getClientRects().length ||
                !e.textContent?.trim() ||
                !e.clientWidth ||
                !e.clientHeight
              )
                return false;
              return (
                parseFloat(getComputedStyle(e).fontSize) < 12 ||
                e.scrollHeight - e.clientHeight > 2 ||
                e.scrollWidth - e.clientWidth > 2
              );
            })
            .map((e) => ({
              tag: e.tagName,
              className: e.className,
              text: e.textContent?.slice(0, 65),
              overflowX: e.scrollWidth - e.clientWidth,
              overflowY: e.scrollHeight - e.clientHeight,
              font: getComputedStyle(e).fontSize,
            })),
        );
        expect(failures, route).toEqual([]);
      }
    });
  }

for (const theme of ["light", "dark"] as const) {
  for (const width of [1440, 768, 390, 320]) {
    test(`assigned products wrap without overlapping at ${width}px in ${theme}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.addInitScript(
        (value) => localStorage.setItem("rerun:appearance", value),
        theme,
      );
      await page.goto("/locations");
      await page
        .getByRole("button", { name: /^Select Electronics-Aisle-2-Shelf-A:/ })
        .click();
      const list = page.getByRole("list", {
        name: "Assigned products",
        exact: true,
      });
      await expect(list.getByRole("button").first()).toHaveAccessibleName(
        /Wireless Earbuds Pro/,
      );
      const checkRows = async () => {
        const bounds = await list
          .locator('[data-slot="item"]')
          .evaluateAll((rows) =>
            rows.map((row) => {
              const title = row.querySelector<HTMLElement>(
                '[data-slot="item-title"]',
              )!;
              const code = row.querySelector<HTMLElement>(
                '[data-slot="item-description"]',
              )!;
              const r = row.getBoundingClientRect(),
                t = title.getBoundingClientRect(),
                c = code.getBoundingClientRect();
              return {
                top: r.top,
                bottom: r.bottom,
                height: r.height,
                width: r.width,
                textOverflow: row.scrollWidth - row.clientWidth,
                titleClipped: title.scrollHeight - title.clientHeight,
                titleSize: parseFloat(getComputedStyle(title).fontSize),
                codeSize: parseFloat(getComputedStyle(code).fontSize),
                titleBottom: t.bottom,
                codeTop: c.top,
                codeBottom: c.bottom,
              };
            }),
          );
        expect(bounds.length).toBeGreaterThanOrEqual(20);
        for (const [i, row] of bounds.entries()) {
          expect(row.height).toBeGreaterThanOrEqual(64);
          expect(row.textOverflow).toBeLessThanOrEqual(1);
          expect(row.titleClipped).toBeLessThanOrEqual(1);
          expect(row.titleSize).toBeGreaterThanOrEqual(14);
          expect(row.codeSize).toBeGreaterThanOrEqual(12);
          expect(row.titleBottom).toBeLessThanOrEqual(row.codeTop + 1);
          expect(row.codeBottom).toBeLessThanOrEqual(row.bottom - 8);
          if (i) expect(bounds[i - 1].bottom).toBeLessThanOrEqual(row.top + 1);
        }
      };
      await checkRows();
      await page
        .getByRole("button", {
          name: "Show more assigned products",
          exact: true,
        })
        .click();
      await checkRows();
      if (width === 390)
        await page.screenshot({
          path: `.private/readable-location-${theme}.png`,
          clip: { x: 0, y: 0, width: 390, height: 1000 },
        });
      await list.getByRole("button").first().click();
      await expect(
        page.getByRole("dialog", { name: "Item details", exact: true }),
      ).toBeVisible();
      await expect(page.getByRole("dialog")).toContainText(
        "Wireless Earbuds Pro",
      );
    });
  }
}
