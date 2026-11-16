import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { posix } from "node:path";
import { productCsvRows } from "../src/lib/csv";
import { makeWorkbook, readWorkbook } from "./workbook";
import { seedMaster } from "../src/lib/seed";
describe("authoritative Excel master", () => {
  it("round-trips editable dollar-based CSV and rejects ambiguous taxable values", async () => {
    const rows = productCsvRows(seedMaster.products),
      headers = Object.keys(rows[0]);
    const encode = (values: unknown[]) =>
      values.map((v) => '"' + String(v).replaceAll('"', '""') + '"').join(",");
    const csv = [
      encode(headers),
      ...rows.map((r) => encode(headers.map((h) => r[h as keyof typeof r]))),
    ].join("\r\n");
    expect(
      (await readWorkbook(Buffer.from(csv), "master.csv", seedMaster)).master,
    ).toEqual(seedMaster);
    await expect(
      readWorkbook(
        Buffer.from(csv.replace('"true"', '"yes"')),
        "bad.csv",
        seedMaster,
      ),
    ).rejects.toThrow("Taxable");
  });
  it("imports prefixed OpenXML with absolute relationship targets", async () => {
    const zip = await JSZip.loadAsync(
      await makeWorkbook(seedMaster, "prefixed", null),
    );
    for (const [name, entry] of Object.entries(zip.files)) {
      if (entry.dir || (!name.endsWith(".xml") && !name.endsWith(".rels")))
        continue;
      let xml = await entry.async("string");
      if (
        xml.includes(
          'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"',
        )
      )
        xml = xml
          .replace(
            'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"',
            'xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"',
          )
          .replace(/<(\/?)([A-Za-z][\w.-]*)(?=[\s/>])/g, "<$1x:$2");
      if (name.endsWith(".rels")) {
        const base = name.includes("/_rels/") ? name.split("/_rels/")[0] : "";
        xml = xml.replace(/Target="([^"]+)"/g, (all, target: string) =>
          target.startsWith("http")
            ? all
            : `Target="/${posix.normalize(posix.join(base, target))}"`,
        );
      }
      zip.file(name, xml);
    }
    expect(
      (
        await readWorkbook(
          await zip.generateAsync({ type: "nodebuffer" }),
          "prefixed.xlsx",
          seedMaster,
        )
      ).master,
    ).toEqual(seedMaster);
  });
  it("round-trips products, locations, categories, cents and revision metadata", async () => {
    const bytes = await makeWorkbook(seedMaster, "rev-id", "previous");
    const loaded = await readWorkbook(bytes, "master.xlsx", seedMaster);
    expect(loaded.master).toEqual(seedMaster);
    expect(loaded.revision).toBe("rev-id");
  });
  it("rejects missing sheets and cells containing formulas", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("Other");
    await expect(
      readWorkbook(
        Buffer.from(await wb.xlsx.writeBuffer()),
        "broken.xlsx",
        seedMaster,
      ),
    ).rejects.toThrow("Products sheet");
    const valid = await makeWorkbook(seedMaster, "r", null);
    const edit = new ExcelJS.Workbook();
    await edit.xlsx.load(valid as never);
    edit.getWorksheet("Products")!.getCell("E2").value = {
      formula: "1+1",
      result: 2,
    };
    await expect(
      readWorkbook(
        Buffer.from(await edit.xlsx.writeBuffer()),
        "formula.xlsx",
        seedMaster,
      ),
    ).rejects.toThrow("formulas");
  });
});

