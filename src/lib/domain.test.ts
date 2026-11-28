import { describe, it, expect } from "vitest";
import {
  parseScan,
  qrPayload,
  validateMaster,
  markdownSuggestion,
} from "./domain";
import { scanLink, scanCodeFromUrl } from "./scan-links";
import { seedMaster } from "./seed";
import type { Unit } from "./types";
describe("documented QR scenarios", () => {
  it("validates the unchanged boots record", () =>
    expect(
      parseScan(qrPayload(seedMaster.products[0]), seedMaster, [], []).findings,
    ).toEqual(["VALID ITEM"]));
  it("flags exactly the documented altered price without overwriting either value", () => {
    const m = structuredClone(seedMaster);
    m.products[1].price = 12000;
    expect(
      parseScan(qrPayload(seedMaster.products[1]), m, [], []).findings,
    ).toEqual(["PRICE MISMATCH"]);
    expect(m.products[1].price).toBe(12000);
  });
  it("finds the registered destination when the payload has no location", () => {
    const p = JSON.parse(qrPayload(seedMaster.products[2]));
    p.Intended_Location = null;
    expect(parseScan(JSON.stringify(p), seedMaster, [], []).findings).toEqual([
      "MISSING LOCATION",
    ]);
  });
  it("rejects ghost item PROD-999", () =>
    expect(
      parseScan(
        '{"Item_ID":"PROD-999","Item_Name":"Ultra Gaming Headset","Price":89.99,"Intended_Location":"Electronics-Aisle-7-Shelf-A"}',
        seedMaster,
        [],
        [],
      ).findings,
    ).toEqual(["UNKNOWN ITEM"]));
  it("detects an altered item name", () => {
    const p = JSON.parse(qrPayload(seedMaster.products[3]));
    p.Item_Name = "Premium Water Bottle";
    expect(parseScan(JSON.stringify(p), seedMaster, [], []).findings).toEqual([
      "ITEM NAME MISMATCH",
    ]);
  });
  it("detects an unknown location", () => {
    const p = JSON.parse(qrPayload(seedMaster.products[4]));
    p.Intended_Location = "Aisle-99-Shelf-Z";
    expect(parseScan(JSON.stringify(p), seedMaster, [], []).findings).toEqual([
      "LOCATION MISMATCH",
    ]);
  });
  it("reports all applicable discrepancies", () =>
    expect(
      parseScan(
        '{"Item_ID":"PROD-001","Item_Name":"Wrong","Price":0}',
        seedMaster,
        [],
        [],
      ).findings,
    ).toHaveLength(3));
  it("rejects malformed, oversized and unsafe external-link payloads", () => {
    for (const s of [
      "{bad",
      "[]",
      "x".repeat(32769),
      "https://example.com/scan?code=PROD-001",
    ])
      expect(() =>
        parseScan(s, seedMaster, [], [], "https://rerun.example"),
      ).toThrow();
  });
  it("resolves a tag to its current unit and rejects ambiguous Item_ID / Unit_ID data", () => {
    const u = { id: "UNIT-1", product_id: "PROD-001" } as Unit;
    expect(
      parseScan(
        "rerun:tag:TAG-1",
        seedMaster,
        [u],
        [{ id: "TAG-1", unit_id: u.id }],
      ).unitId,
    ).toBe(u.id);
    expect(() =>
      parseScan(
        '{"Item_ID":"PROD-002","Unit_ID":"UNIT-1"}',
        seedMaster,
        [u],
        [],
      ),
    ).toThrow();
    expect(
      parseScan("TAG-2", seedMaster, [], [{ id: "TAG-2", unit_id: null }])
        .findings,
    ).toEqual(["UNASSIGNED TAG"]);
  });
  it("opens a browser link and verifies the code inside it, including snapshot differences", () => {
    const origin = "https://rerun.example";
    const base = seedMaster.products[0];
    const code = qrPayload({ ...base, price: base.price - 100 });
    const url = new URL(scanLink(code, origin));
    expect(url.origin).toBe(origin);
    expect(url.pathname).toBe("/scan");
    expect(url.search).toBe("");
    expect(scanCodeFromUrl(url.search, url.hash)).toBe(code);
    expect(parseScan(url.href, seedMaster, [], [], origin).findings).toEqual([
      "PRICE MISMATCH",
    ]);
    expect(
      parseScan(origin + "/scan?code=PROD-001", seedMaster, [], [], origin)
        .productId,
    ).toBe(base.id);
  });
  it("resolves opened tag labels across the production domains", () => {
    const origin =
      "https://rerun-smart-price-tag-venadiunns-projects.vercel.app";
    const url = new URL(scanLink("TAG-UNASSIGNED", origin));
    expect(url.hostname).toBe("rerun-smart-price-tag-psi.vercel.app");
    expect(
      parseScan(
        url.href,
        seedMaster,
        [],
        [{ id: "TAG-UNASSIGNED", unit_id: null }],
        origin,
      ).findings,
    ).toEqual(["UNASSIGNED TAG"]);
    expect(() =>
      parseScan(
        "https://example.com/scan#item=PROD-001",
        seedMaster,
        [],
        [],
        origin,
      ),
    ).toThrow();
  });
  it("does not accept extra fractional cents", () => {
    const p = JSON.parse(qrPayload(seedMaster.products[0]));
    p.Price = 120.001;
    expect(parseScan(JSON.stringify(p), seedMaster, [], []).findings).toEqual([
      "PRICE MISMATCH",
    ]);
  });
});
describe("master and pricing", () => {
  it("accepts the eight documented products with typed prices", () =>
    expect(validateMaster(seedMaster).products).toHaveLength(8));
  it("rejects duplicate IDs, ambiguous aliases and broken references", () => {
    const m = structuredClone(seedMaster);
    m.products.push(m.products[0]);
    expect(() => validateMaster(m)).toThrow();
    const n = structuredClone(seedMaster);
    n.products[0].barcode = n.products[1].id;
    expect(() => validateMaster(n)).toThrow();
    const o = structuredClone(seedMaster);
    o.products[0].locationId = "missing";
    expect(() => validateMaster(o)).toThrow();
  });
  it("treats zero price as real and missing price as invalid", () => {
    const m = structuredClone(seedMaster);
    m.products[0].price = 0;
    expect(validateMaster(m).products[0].price).toBe(0);
    expect(() =>
      validateMaster({ ...m, products: [{ ...m.products[0], price: null }] }),
    ).toThrow();
  });
  it("handles markdown thresholds, insufficient data and cost floors", () => {
    const p = seedMaster.products[0],
      u = [{ product_id: p.id, status: "Restocked" }] as Unit[],
      rules = { ageDays: 30, sellThrough: 20, discount: 10 },
      now = new Date("2026-11-16");
    expect(markdownSuggestion(p, u, rules, now).price).toBe(10800);
    expect(markdownSuggestion(p, [], rules, now).eligible).toBe(false);
    expect(
      markdownSuggestion({ ...p, cost: 11500 }, u, rules, now).message,
    ).toBe("Below cost floor");
    expect(
      markdownSuggestion({ ...p, introducedAt: "2026-11-01" }, u, rules, now)
        .eligible,
    ).toBe(false);
    expect(
      markdownSuggestion(
        p,
        [
          ...u,
          ...Array.from({ length: 4 }, () => ({
            product_id: p.id,
            status: "Sold",
          })),
        ] as Unit[],
        rules,
        now,
      ).eligible,
    ).toBe(false);
  });
});
