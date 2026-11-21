import { test, expect } from "@playwright/test";
test.use({
  storageState:
    process.env.STAFF_STORAGE_STATE ?? ".private/administrator.state.json",
});
for (const theme of ["light", "dark"])
  for (const width of [1920, 1440, 768, 320]) {
    test(`capacity controls align at ${width}px in ${theme}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.addInitScript(
        (t) => localStorage.setItem("rerun:appearance", t),
        theme,
      );
      await page.goto("/locations");
      await page
        .getByRole("button", { name: "Capacity grid", exact: true })
        .click();
      await page.locator(".map-location").first().getByRole("button").click();
      const cards = await page
        .locator(".map-location")
        .evaluateAll((elements) =>
          elements.map((e) => {
            const c = e.getBoundingClientRect(),
              button = e.querySelector<HTMLElement>('[data-slot="button"]')!,
              b = button.getBoundingClientRect(),
              bar = e.querySelector(".capacity-bar")!.getBoundingClientRect();
            return {
              top: c.top,
              height: c.height,
              bar: bar.top,
              buttonTop: b.top,
              buttonBottom: b.bottom,
              bottomInset: c.bottom - b.bottom,
              leftInset: b.left - c.left,
              rightInset: c.right - b.right,
              buttonHeight: b.height,
              buttonBorder: getComputedStyle(button).borderTopStyle,
              overflow: e.scrollWidth - e.clientWidth,
            };
          }),
        );
      expect(cards.length).toBeGreaterThan(10);
      for (const card of cards) {
        expect(card.bottomInset).toBeGreaterThanOrEqual(16);
        expect(card.leftInset).toBeGreaterThanOrEqual(16);
        expect(card.rightInset).toBeGreaterThanOrEqual(16);
        expect(card.buttonHeight).toBeGreaterThanOrEqual(width < 768 ? 44 : 40);
        expect(card.buttonBorder).toBe("solid");
        expect(card.overflow).toBeLessThanOrEqual(1);
        for (const peer of cards.filter(
          (c) => Math.abs(c.top - card.top) < 1,
        )) {
          expect(Math.abs(peer.buttonTop - card.buttonTop)).toBeLessThanOrEqual(
            1,
          );
          expect(
            Math.abs(peer.buttonBottom - card.buttonBottom),
          ).toBeLessThanOrEqual(1);
          expect(Math.abs(peer.bar - card.bar)).toBeLessThanOrEqual(1);
        }
      }
      const markers = await page
        .locator(".map-legend i")
        .evaluateAll((es) =>
          es.map((e) => ({
            width: e.getBoundingClientRect().width,
            height: e.getBoundingClientRect().height,
            border: getComputedStyle(e).borderTopStyle,
          })),
        );
      expect(markers).toHaveLength(3);
      for (const marker of markers) {
        expect(marker.width).toBe(12);
        expect(marker.height).toBe(12);
        expect(["solid", "dashed"]).toContain(marker.border);
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - innerWidth,
        ),
      ).toBeLessThanOrEqual(1);
      if (width === 1920 || width === 320) {
        await page.locator(".map-floor").scrollIntoViewIfNeeded();
        await page.screenshot({
          path: `.private/aligned-grid-${theme}-${width}.png`,
        });
      }
    });
  }
