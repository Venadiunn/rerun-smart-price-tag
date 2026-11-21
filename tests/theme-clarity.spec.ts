import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test.use({
  storageState:
    process.env.STAFF_STORAGE_STATE ?? ".private/administrator.state.json",
});
for (const theme of ["light", "dark"])
  for (const width of [1440, 390])
    test(`shadcn controls stay clear at ${width}px in ${theme}`, async ({
      page,
    }) => {
      test.setTimeout(90000);
      await page.setViewportSize({ width, height: 1000 });
      await page.addInitScript(
        (t) => localStorage.setItem("rerun:appearance", t),
        theme,
      );
      for (const route of ["/history", "/master"]) {
        await page.goto(route);
        await page.locator("main h1").waitFor();
        await page.evaluate(() => document.fonts.ready);
        expect(
          await page
            .locator("body")
            .evaluate((e) => parseFloat(getComputedStyle(e).fontSize)),
        ).toBeCloseTo(18.4, 1);
        const tabs = await page
          .locator('[data-slot="tabs-trigger"]')
          .evaluateAll((es) =>
            es.map((e) => {
              const b = e.getBoundingClientRect(),
                label = e.querySelector(".tab-label")!,
                count = e.querySelector(".tab-count")!,
                l = label.getBoundingClientRect(),
                c = count.getBoundingClientRect();
              const range = document.createRange();
              range.selectNodeContents(label);
              return {
                height: b.height,
                labelLines: range.getClientRects().length,
                labelRight: l.right,
                countLeft: c.left,
                overflow: e.scrollWidth - e.clientWidth,
              };
            }),
          );
        for (const tab of tabs) {
          expect(tab.overflow).toBeLessThanOrEqual(1);
          expect(tab.labelRight).toBeLessThanOrEqual(tab.countLeft);
          if (width === 1440) expect(tab.labelLines).toBe(1);
          expect(Math.abs(tab.height - tabs[0].height)).toBeLessThanOrEqual(1);
        }
        const header = await page
          .locator('.workspace-topbar [data-slot="button"]')
          .evaluateAll((es) =>
            es.map((e) => {
              const r = e.getBoundingClientRect();
              return { width: r.width, height: r.height };
            }),
          );
        for (const button of header) {
          expect(button.width).toBeCloseTo(header[0].width, 0);
          expect(button.height).toBeCloseTo(header[0].height, 0);
        }
        const icons = await page
          .locator(
            '.workspace-topbar [data-slot="button"] > svg:visible,.search-box > svg:visible',
          )
          .evaluateAll((es) =>
            es.map((e) => ({
              width: e.getBoundingClientRect().width,
              height: e.getBoundingClientRect().height,
              stroke: getComputedStyle(e).strokeWidth,
            })),
          );
        for (const icon of icons) {
          expect(icon.width).toBeCloseTo(20.7, 0);
          expect(icon.height).toBeCloseTo(20.7, 0);
          expect(icon.stroke).toBe("2px");
        }
        if (route === "/history") {
          const trigger = page.locator(".history-table summary").first();
          const label = trigger.locator(".disclosure-label");
          expect(
            await label.evaluate((e) => {
              const r = document.createRange();
              r.selectNodeContents(e);
              return r.getClientRects().length;
            }),
          ).toBe(1);
          await trigger.click();
          await expect(trigger.locator("svg")).toHaveCSS(
            "transform",
            "matrix(0, 1, -1, 0, 0, 0)",
          );
          await trigger.press("Enter");
          await expect(trigger.locator("svg")).toHaveCSS("transform", "none");
        }
        const axe = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze();
        expect(
          axe.violations.map((v) => ({
            id: v.id,
            nodes: v.nodes.map((n) => n.target),
          })),
        ).toEqual([]);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth - innerWidth,
          ),
        ).toBeLessThanOrEqual(1);
        await page.screenshot({
          path: `.private/clarity-${theme}-${width}-${route.slice(1)}.png`,
        });
      }
    });
test("read-only master records do not show empty action or category columns", async ({
  page,
}) => {
  await page.route("**/rpc/rerun_snapshot", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.profile.role = "associate";
    data.profiles = [];
    await route.fulfill({ response, json: data });
  });
  await page.goto("/master");
  await page
    .getByRole("heading", { name: "Master data", exact: true })
    .waitFor();
  await expect(
    page.getByRole("columnheader", { name: "Action", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator("thead th")).toHaveCount(3);
  await page.getByRole("tab", { name: /^categories/i }).click();
  await expect(page.locator("thead th")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Edit", exact: true }),
  ).toHaveCount(0);
});
