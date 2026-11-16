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
  test("dashboard, inventory lookup, unit details and generated QR", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "A clearer view of your floor." }),
    ).toBeVisible();
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
      ["/locations", "Make every location familiar."],
      ["/tags", "A new chapter for every tag."],
      ["/pricing", "A thoughtful approach to pricing."],
      ["/history", "Nothing gets lost in the process."],
      ["/master", "One trusted source of truth."],
      ["/settings", "A workspace your team can trust."],
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
    await page.getByRole("button", { name: /Scan records/ }).click();
    await expect(
      page
        .locator(".scan-history")
        .getByText("MISSING LOCATION", { exact: true })
        .first(),
    ).toBeVisible();
  });
  test("master workbook download and reviewed import", async ({ page }) => {
    await page.goto("/master");
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
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Publish new revision" }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Discard draft" }).click();
  });
  test("mobile layout and navigation", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "A clearer view of your floor." }),
    ).toBeVisible();
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
      page.getByRole("heading", { name: "The right item. The right place." }),
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
    await page.goto("/inventory");
    await page
      .getByRole("button", { name: "Open Premium Leather Boots" })
      .click();
    const image = await page
      .locator("canvas")
      .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
    await page.getByLabel("Close dialog").click();
    await page.goto("/scan");
    await page.locator("input[type=file]").setInputFiles({
      name: "generated-qr.png",
      mimeType: "image/png",
      buffer: Buffer.from(image.split(",")[1], "base64"),
    });
    await expect(page.locator(".scan-alerts")).toContainText("VALID ITEM");
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
    await page
      .getByRole("button", { name: "Start camera", exact: true })
      .click();
    await expect(page.locator(".scan-alerts")).toContainText("VALID ITEM");
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
  await expect(
    page.getByRole("heading", { name: "A clearer view of your floor." }),
  ).toBeVisible();
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
  await expect(
    page.getByRole("heading", { name: "A clearer view of your floor." }),
  ).toBeVisible();
  users.associate.password = password;
  fs.writeFileSync(".private/test-users.json", JSON.stringify(users));
  expect(page.url()).not.toContain("token_hash");
});

