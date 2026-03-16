import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import fs from "node:fs";
import path from "node:path";

const TEMPLATES_DIR = path.join(process.cwd(), "templates");

describe("Phase 0: Foundation smoke tests", () => {
  it("internal acts template v2 is readable and has 11 sheets", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path.join(TEMPLATES_DIR, "Акты ГНБ шаблон v2.xlsx"));
    expect(wb.worksheets.length).toBe(11);
    expect(wb.getWorksheet("Лист1")).toBeDefined();
  });

  it("АОСР template is readable and has 3 sheets", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path.join(TEMPLATES_DIR, "АОСР шаблон.xlsx"));
    expect(wb.worksheets.length).toBe(3);
    expect(wb.getWorksheet("Лист1")).toBeDefined();
    expect(wb.getWorksheet("АОСР (1)")).toBeDefined();
    expect(wb.getWorksheet("АОСР (2)")).toBeDefined();
  });

  it("internal acts template has formulas E31 and H31", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path.join(TEMPLATES_DIR, "Акты ГНБ шаблон v2.xlsx"));
    const ws = wb.getWorksheet("Лист1")!;
    expect(ws.getCell("E31").formula).toBe("C31*D31");
    expect(ws.getCell("H31").formula).toBe("E31/13");
  });

  it("АОСР template has formula B4=C3*B3", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path.join(TEMPLATES_DIR, "АОСР шаблон.xlsx"));
    const ws = wb.getWorksheet("Лист1")!;
    expect(ws.getCell("B4").formula).toBe("C3*B3");
  });

  it("golden reference fixtures exist", () => {
    const dir = path.join(process.cwd(), "tests", "fixtures");
    expect(fs.existsSync(path.join(dir, "golden-5-5-v2-raw.json"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "golden-3-3-raw.json"))).toBe(true);
  });

  it("golden 5-5 has expected gnb_number", () => {
    const data = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "tests", "fixtures", "golden-5-5-v2-raw.json"), "utf-8")
    );
    expect(data.gnb_number).toBe("ЗП № 5-5");
    expect(data.gnb_number_short).toBe("5-5");
    expect(data.profile_length).toBe(194.67);
    expect(data.pipe_count).toBe(2);
  });

  it("secondary sheets reference Лист1 via formulas (not hardcoded)", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path.join(TEMPLATES_DIR, "Акты ГНБ шаблон v2.xlsx"));
    // Spot-check: Разбивка C1 should reference Лист1!B14
    const ws = wb.getWorksheet("Разбивка")!;
    expect(ws.getCell("C1").formula).toContain("Лист1");
  });
});
