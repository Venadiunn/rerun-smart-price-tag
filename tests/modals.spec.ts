import { test, expect, type Page } from "@playwright/test";

test.use({ storageState: ".private/modal-admin.state.json" });

async function checkModal(page: Page, title: string) {
  const dialog = page.getByRole("dialog", { name: title, exact: true });
  await expect(dialog).toBeVisible();
  const bounds = await dialog.evaluate((element) => {
    const r = element.getBoundingClientRect();
    const body = element.querySelector<HTMLElement>(".modal-body")!;
    const close = element.querySelector<HTMLButtonElement>(
      '[aria-label="Close dialog"]',
    )!;
    return {
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      overflow: body.scrollWidth - body.clientWidth,
      closeWidth: close.getBoundingClientRect().width,
      closeHeight: close.getBoundingClientRect().height,
      fieldsReadable: [
        ...element.querySelectorAll(
          "input:not([type=checkbox]),select,textarea",
        ),
      ].every((e) => parseFloat(getComputedStyle(e).fontSize) >= 16),
    };
  });
  expect(
    Math.abs(bounds.x + bounds.width / 2 - bounds.viewportWidth / 2),
  ).toBeLessThanOrEqual(2);
  expect(
    Math.abs(bounds.y + bounds.height / 2 - bounds.viewportHeight / 2),
  ).toBeLessThanOrEqual(2);
  expect(bounds.x).toBeGreaterThanOrEqual(10);
  expect(bounds.y).toBeGreaterThanOrEqual(10);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(
    bounds.viewportWidth - 10,
  );
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(
    bounds.viewportHeight - 10,
  );
  expect(bounds.overflow).toBeLessThanOrEqual(1);
  expect(bounds.fieldsReadable).toBe(true);
  expect(bounds.closeWidth).toBeGreaterThanOrEqual(44);
  expect(bounds.closeHeight).toBeGreaterThanOrEqual(44);
  expect(
    await page.evaluate(() =>
      [document.body, document.documentElement].some((e) =>
        ["hidden", "clip"].includes(getComputedStyle(e).overflowY),
      )
        ? "hidden"
        : "",
    ),
  ).toBe("hidden");
  const headerBefore = await dialog.locator(".modal-top").boundingBox();
  await dialog.locator(".modal-body").evaluate((e) => {
    e.scrollTop = e.scrollHeight;
  });
  const headerAfter = await dialog.locator(".modal-top").boundingBox();
  expect(headerAfter!.y).toBe(headerBefore!.y);
  await expect(
    dialog.getByRole("button", { name: "Close dialog", exact: true }),
  ).toBeInViewport();
  await dialog
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      [document.body, document.documentElement].some((e) =>
        ["hidden", "clip"].includes(getComputedStyle(e).overflowY),
      )
        ? "hidden"
        : "",
    ),
  ).not.toBe("hidden");
}

for (const viewport of [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "phone", width: 390, height: 844 },
  { name: "narrow phone", width: 320, height: 640 },
  { name: "landscape phone", width: 844, height: 390 },
]) {
  test(`all shared popups center, scroll and fit on ${viewport.name}`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    await page.setViewportSize(viewport);
    await page.goto("/inventory");
    await page
      .getByRole("button", { name: "Review & place", exact: true })
      .first()
      .click();
    await checkModal(page, "Item details");
    await page
      .getByRole("button", { name: "Receive stock", exact: true })
      .click();
    await checkModal(page, "Receive stock");
    await page.goto("/pricing");
    await page
      .getByRole("button", { name: "Request price change", exact: true })
      .click();
    await checkModal(page, "Request a price change");
    await page.goto("/tags");
    await page.locator(".tag-card").first().click();
    const tagTitle = await page
      .getByRole("dialog")
      .locator(".modal-top h2")
      .innerText();
    await checkModal(page, tagTitle);
    await page
      .getByRole("button", { name: "Register tag", exact: true })
      .click();
    await checkModal(page, "Register a reusable tag");
    await page.goto("/settings");
    await page
      .getByRole("button", { name: "Add employee", exact: true })
      .click();
    await checkModal(page, "Add employee");
    await page
      .locator("button:not(:disabled)")
      .filter({ hasText: /^Edit access$/ })
      .first()
      .click();
    await checkModal(page, "Edit employee access");
    await page.goto("/master");
    await page
      .getByRole("button", { name: "Add product", exact: true })
      .click();
    await checkModal(page, "Add product");
    await page.getByRole("tab", { name: /^locations/ }).click();
    await page
      .getByRole("button", { name: "Add location", exact: true })
      .click();
    await checkModal(page, "Add location");
    await page.getByRole("tab", { name: /^categories/ }).click();
    await page
      .getByRole("button", { name: "Add category", exact: true })
      .click();
    await checkModal(page, "Add category");
  });
}

test("Review & place keeps header visible, traps focus, closes with Escape and restores focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/inventory");
  const trigger = page
    .getByRole("button", { name: "Review & place", exact: true })
    .first();
  await trigger.click();
  const dialog = page.getByRole("dialog", {
    name: "Item details",
    exact: true,
  });
  await expect(dialog.getByLabel("Close dialog")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  expect(await dialog.evaluate((e) => e.contains(document.activeElement))).toBe(
    true,
  );
  await page.keyboard.press("Tab");
  await expect(dialog.getByLabel("Close dialog")).toBeFocused();
  const body = dialog.locator(".modal-body");
  await body.evaluate((e) => {
    e.scrollTop = e.scrollHeight;
  });
  expect(await body.evaluate((e) => e.scrollTop)).toBeGreaterThan(0);
  await expect(dialog.getByLabel("Close dialog")).toBeInViewport();
  await page.screenshot({ path: ".private/modal-phone-scrolled.png" });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("private activation popup also fits desktop and phone without generating real tokens", async ({
  page,
}) => {
  await page.route("**/functions/v1/staff", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "authorization,apikey,content-type,x-client-info",
        "Access-Control-Allow-Methods": "POST,OPTIONS",
      },
      body:
        route.request().method() === "OPTIONS"
          ? "{}"
          : JSON.stringify({
              tokenHash: "layout-test-placeholder",
              type: "recovery",
            }),
    }),
  );
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/settings");
    await page
      .getByRole("button", { name: "Activation / recovery", exact: true })
      .first()
      .click();
    await checkModal(page, "Private account activation");
  }
});

test("focused forms fit a reduced mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/pricing");
  await page
    .getByRole("button", { name: "Request price change", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Request a price change" });
  await dialog.getByLabel("Reason").focus();
  await page.setViewportSize({ width: 390, height: 450 });
  await checkModal(page, "Request a price change");
});

test("mobile keyboard can shrink the visible viewport without changing the page layout", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    const viewport = Object.assign(new EventTarget(), {
      width: 390,
      height: 844,
      offsetLeft: 0,
      offsetTop: 0,
    });
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: viewport,
    });
  });
  await page.goto("/pricing");
  await page
    .getByRole("button", { name: "Request price change", exact: true })
    .click();
  await page.evaluate(() => {
    Object.assign(window.visualViewport!, { height: 400, offsetTop: 40 });
    window.visualViewport!.dispatchEvent(new Event("resize"));
  });
  const dialog = page.getByRole("dialog", { name: "Request a price change" });
  await expect
    .poll(async () => {
      const b = await dialog.boundingBox();
      return Math.abs(b!.y + b!.height / 2 - 240);
    })
    .toBeLessThanOrEqual(2);
  const b = await dialog.boundingBox();
  expect(b!.y).toBeGreaterThanOrEqual(52);
  expect(b!.y + b!.height).toBeLessThanOrEqual(428);
  await dialog.getByLabel("Close dialog").click();
});
