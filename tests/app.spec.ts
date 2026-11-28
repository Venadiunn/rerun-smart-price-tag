import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
test.afterEach(async ({ page }) => {
  const state = await page.context().storageState();
  const saved = state.origins
    .flatMap((o) => o.localStorage)
    .find((v) => v.name === "sb-ikuvbteklxjbsixwhril-auth-token");
  if (saved) {
    const session = JSON.parse(saved.value);
    const admin = JSON.parse(
      fs.readFileSync(".private/admin-session.json", "utf8"),
    );
    if (session.user?.id === admin.user.id) {
      fs.writeFileSync(".private/admin-session.json", JSON.stringify(session));
      fs.writeFileSync(
        ".private/administrator.state.json",
        JSON.stringify(state),
      );
    }
  }
});
test("signed-out staff gate and invalid login", async ({ page }) => {
  await page.goto("/inventory");
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  await page.getByLabel("Email address").fill("nobody@example.com");
  await page.getByLabel("Password", { exact: true }).fill("incorrect-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(/Invalid|credentials/i);
});
test.describe("administrator workspace", () => {
  test.use({ storageState: ".private/administrator.state.json" });
  test("tag pool covers all configured store capacity slots", async ({
    page,
  }) => {
    await page.goto("/tags");
    const counts = page.locator(".summary-line strong");
    await expect(counts.first()).toBeVisible();
    const total = await counts.nth(0).innerText();
    expect(Number(total.replaceAll(",", ""))).toBeGreaterThan(500000);
    await expect(counts.nth(1)).toHaveText(total);
    await page.getByLabel("Tag status filter").selectOption("Available");
    await expect(page.locator(".tag-card").first()).toBeVisible();
    await page
      .locator(".tag-card")
      .first()
      .getByRole("button", { name: /^Manage / })
      .click();
    await expect(page.getByRole("dialog").locator("canvas")).toBeVisible();
    await expect(page.getByRole("dialog")).toContainText(
      "Assign to an eligible unit",
    );
    await page.getByLabel("Close dialog").click();
    await page.setViewportSize({ width: 320, height: 640 });
    await page.reload();
    await expect(page.locator(".summary-line")).toContainText(
      total + " total tags",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
  test("dashboard, inventory lookup, unit details and generated QR", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
    await page.screenshot({
      path: ".private/overview-desktop.png",
      fullPage: true,
    });
    await page.getByRole("link", { name: "Inventory", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Search inventory" })
      .fill("PROD-001");
    await expect(
      page.getByRole("button", { name: "Open Premium Leather Boots" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Open Wireless Earbuds Pro" }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Open Premium Leather Boots" })
      .click();
    await expect(page.getByRole("dialog")).toContainText("Aisle-4-Shelf-B");
    await expect(page.locator("canvas")).toBeVisible();
    await page.getByLabel("Close dialog").click();
  });
  test("all screens load and desktop navigation works", async ({ page }) => {
    for (const [route, title] of [
      ["/locations", "Store locations"],
      ["/tags", "Reusable tags"],
      ["/pricing", "Pricing"],
      ["/history", "Activity history"],
      ["/master", "Master data"],
      ["/settings", "Settings"],
    ]) {
      await page.goto(route);
      await expect(page.getByRole("heading", { name: title })).toBeVisible();
    }
    await expect(
      page.getByRole("heading", { name: "Employees", exact: true }),
    ).toBeVisible();
  });
  test("QR discrepancies persist and require acknowledgment", async ({
    page,
  }) => {
    await page.goto("/scan");
    await page.getByRole("textbox", { name: "Item code or QR JSON" }).fill(
      JSON.stringify({
        Item_ID: "PROD-003",
        Item_Name: "Classic Cotton T-Shirt",
        Price: 19.99,
        Intended_Location: null,
      }),
    );
    await page.getByRole("button", { name: "Look up item" }).click();
    await expect(page.locator(".scan-alerts")).toContainText(
      "MISSING LOCATION",
    );
    await expect(page.locator(".scan-result")).toContainText(
      "Clothing-Aisle-1-Rack-C",
    );
    await page
      .getByRole("button", { name: "Acknowledge discrepancy", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Acknowledged", exact: true }),
    ).toBeDisabled();
    await page.reload();
    await page.goto("/history");
    await page.getByRole("tab", { name: /Scan records/ }).click();
    await expect(
      page
        .locator(".scan-history")
        .getByText("MISSING LOCATION", { exact: true })
        .first(),
    ).toBeVisible();
  });
  test("master workbook download and reviewed import", async ({ page }) => {
    await page.goto("/master");
    test.setTimeout(90000);
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download master XLSX" }).click();
    const file = await pending;
    expect(file.suggestedFilename()).toContain(".xlsx");
    await page.locator("input[type=file]").setInputFiles({
      name: file.suggestedFilename(),
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: fs.readFileSync((await file.path())!),
    });
    await expect(
      page.getByRole("heading", { name: "Review 0 changes" }),
    ).toBeVisible({ timeout: 45000 });
    await expect(
      page.getByRole("button", { name: "Publish new revision" }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Discard draft" }).click();
  });
  test("mobile layout and navigation", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: ".private/overview-mobile.png",
      fullPage: true,
    });
    await page.getByLabel("Toggle navigation").click();
    await page.getByRole("link", { name: "Scan & verify" }).click();
    await expect(
      page.getByRole("heading", { name: "Scan & verify" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
  test("Nimiq-generated QR decodes through image upload and a simulated camera stream", async ({
    page,
  }) => {
    await page.addInitScript(() =>
      localStorage.setItem("rerun:appearance", "dark"),
    );
    await page.goto("/inventory");
    await page
      .getByRole("textbox", { name: "Search inventory" })
      .fill("PROD-001");
    await page
      .getByRole("button", { name: "Open Premium Leather Boots" })
      .click();
    const link = await page
      .getByRole("link", { name: "Open lookup" })
      .getAttribute("href");
    expect(new URL(link!).pathname).toBe("/scan");
    expect(new URL(link!).hash).toBe("#item=PROD-001");
    const image = await page
      .locator("canvas")
      .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
    await page.getByLabel("Close dialog").click();
    await page.goto("/scan");
    const camera = page.getByRole("button", {
      name: "Start camera",
      exact: true,
    });
    const hasCameraApi = await page.evaluate(
      () => window.isSecureContext && !!navigator.mediaDevices?.getUserMedia,
    );
    if (hasCameraApi) {
      await page.evaluate(() => {
        Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
          configurable: true,
          value: async () => {
            throw new DOMException("Permission denied", "NotAllowedError");
          },
        });
      });
      await camera.click();
      await expect(page.locator(".inline-error")).toContainText(
        "Allow camera access for ReRun",
      );
    } else {
      await expect(camera).toBeDisabled();
      await expect(page.locator(".camera-placeholder")).toContainText(
        "Live camera access is unavailable here",
      );
    }

    await page.locator("input[type=file]").setInputFiles({
      name: "generated-qr.png",
      mimeType: "image/png",
      buffer: Buffer.from(image.split(",")[1], "base64"),
    });
    await expect(page.locator(".scan-alerts")).toContainText("VALID ITEM");
    const canSimulateCamera =
      hasCameraApi &&
      (await page.evaluate(
        () =>
          typeof document.createElement("canvas").captureStream === "function",
      ));
    if (!canSimulateCamera) return;
    await page.getByRole("button", { name: "Clear", exact: true }).click();
    await page.evaluate(async (image) => {
      const source = new Image();
      source.src = image;
      await source.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 480;
      const context = canvas.getContext("2d")!;
      const paint = () => {
        context.fillStyle = "white";
        context.fillRect(0, 0, 640, 480);
        context.drawImage(source, 180, 100, 280, 280);
      };
      paint();
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
        configurable: true,
        value: async () => {
          const stream = canvas.captureStream(10);
          const timer = setInterval(paint, 100);
          stream
            .getVideoTracks()[0]
            .addEventListener("ended", () => clearInterval(timer));
          return stream;
        },
      });
    }, image);
    await camera.click();
    await expect(page.locator(".scan-alerts")).toContainText("VALID ITEM");
  });
  test("overview sorting and searchable smart-tag coverage", async ({
    page,
  }) => {
    await page.goto("/");
    await page
      .getByRole("button", {
        name: "Auto sort and assign smart tags",
        exact: true,
      })
      .click();
    await expect(page.locator(".sort-summary")).toContainText(
      "0 allocated units need tags",
    );
    await page
      .getByRole("link", { name: "View smart tags", exact: true })
      .click();
    await page.getByLabel("Search smart tags").fill("PROD-009");
    await expect(page.locator(".tag-card").first()).toBeVisible();
    await page
      .locator(".tag-card")
      .first()
      .getByRole("button", { name: /^Manage / })
      .click();
    await expect(page.locator(".digital-tag")).toContainText(
      "Everyday Oxford Shirt",
    );
    await expect(page.getByRole("dialog").locator("canvas")).toBeVisible();
    await page.getByLabel("Close dialog").click();
    await page.getByLabel("Search smart tags").fill("no-such-tag-identifier");
    await expect(
      page.getByText("No smart tags match this search."),
    ).toBeVisible();
    await page.goto("/inventory");
    await page.getByLabel("Search inventory").fill("PROD-009");
    await page
      .getByRole("button", {
        name: "Open Everyday Oxford Shirt / Sky Blue / S",
        exact: true,
      })
      .click();
    await page
      .getByLabel("Physical unit", { exact: true })
      .selectOption({ index: 1 });
    await page.getByLabel("QR label format").selectOption("tag");
    await expect(
      page.getByRole("dialog").locator(".label-sidebar"),
    ).toContainText(/TAG-/);
    await expect(page.getByRole("dialog").locator("canvas")).toBeVisible();
  });
});
test("associate authenticates with password and cannot access employee/master controls", async ({
  page,
}) => {
  const user = JSON.parse(
    fs.readFileSync(".private/test-users.json", "utf8"),
  ).associate;
  await page.goto("/");
  await page.getByLabel("Email address").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await page.goto("/master");
  await expect(
    page.getByText("Import CSV / XLSX", { exact: true }),
  ).toHaveCount(0);
  await page.goto("/settings");
  await expect(
    page.getByRole("heading", { name: "Employees", exact: true }),
  ).toHaveCount(0);
});
test("employee activation validates confirmation before consuming the private token", async ({
  page,
}) => {
  const admin = JSON.parse(
    fs.readFileSync(".private/admin-session.json", "utf8"),
  );
  const sb = createClient(
    "https://ikuvbteklxjbsixwhril.supabase.co",
    "sb_publishable_FnpGIa5bHpNIvCz_xlYodA_n8wRubNc",
    { auth: { persistSession: false } },
  );
  const auth = await sb.auth.setSession(admin);
  if (auth.error) throw auth.error;
  fs.writeFileSync(
    ".private/admin-session.json",
    JSON.stringify(auth.data.session),
  );
  const users = JSON.parse(fs.readFileSync(".private/test-users.json", "utf8")),
    user = users.associate;
  const { data, error } = await sb.functions.invoke("staff", {
    body: {
      action: "activation",
      userId: user.id,
      email: user.email,
      role: "associate",
    },
  });
  if (error) throw error;
  await page.goto(`/activate?token_hash=${encodeURIComponent(data.tokenHash)}`);
  const password = `ReRun-test-${crypto.randomUUID()}`;
  await page.getByLabel("New password", { exact: true }).fill(password);
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("does-not-match");
  await page
    .getByRole("button", { name: "Activate account", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Passwords do not match");
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Activate account", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  users.associate.password = password;
  fs.writeFileSync(".private/test-users.json", JSON.stringify(users));
  expect(page.url()).not.toContain("token_hash");
});
