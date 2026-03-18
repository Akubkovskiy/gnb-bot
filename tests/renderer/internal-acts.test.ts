import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import ExcelJS from "exceljs";
import { renderInternalActs } from "../../src/renderer/internal-acts.js";
import type { Transition } from "../../src/domain/types.js";
import { makeTestTransition } from "./fixtures.js";

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "gnb-render-ia-"));
}

describe("renderInternalActs", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("produces an xlsx file with correct filename", async () => {
    tmpDir = makeTmpDir();
    const result = await renderInternalActs(makeTestTransition(), tmpDir);

    expect(result.filePath).toContain("Акты ЗП ГНБ 5-5.xlsx");
    expect(fs.existsSync(result.filePath)).toBe(true);
  });

  it("fills all 27 data cells", async () => {
    tmpDir = makeTmpDir();
    const result = await renderInternalActs(makeTestTransition(), tmpDir);

    // 28 cells: 9 identification + 3 orgs + 8 signatories + 2 pipe + 6 gnb params (including A31)
    expect(result.cellsFilled).toBe(28);
  });

  it("writes correct values to key cells", async () => {
    tmpDir = makeTmpDir();
    const t = makeTestTransition();
    const result = await renderInternalActs(t, tmpDir);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(result.filePath);
    const sheet = wb.getWorksheet("Лист1")!;

    // B3 = title_line
    expect(sheet.getCell("B3").value).toBe("Строительство КЛ 10кВ методом ГНБ");
    // B5 = address
    expect(sheet.getCell("B5").value).toBe("г. Москва, Огородный проезд, д. 11");
    // B6 = gnb_number
    expect(sheet.getCell("B6").value).toBe("ЗП № 5-5");
    // B8 = start_date formatted
    expect(sheet.getCell("B8").value).toBe("«10» декабря 2025 г.");
    // B14 = customer display (department + short_name)
    expect(sheet.getCell("B14").value).toBe("СВРЭС АО «ОЭК»");
    // C20 = sign1 line (position + name, no underscores)
    expect(sheet.getCell("C20").value).toBe("Мастер по ЭРС СВРЭС  Коробков Ю.Н.");
    // C31 = profile_length
    expect(sheet.getCell("C31").value).toBe(194.67);
    // A31 = gnb_number in table
    expect(sheet.getCell("A31").value).toBe("ЗП № 5-5");
  });

  it("writes space for empty optional fields", async () => {
    tmpDir = makeTmpDir();
    const t = makeTestTransition();
    // Remove optional gnb params
    t.gnb_params.plan_length = undefined;
    t.gnb_params.drill_diameter = undefined;
    t.gnb_params.configuration = undefined;

    const result = await renderInternalActs(t, tmpDir);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(result.filePath);
    const sheet = wb.getWorksheet("Лист1")!;

    // Empty optionals should be " " (space), not null
    expect(sheet.getCell("B31").value).toBe(" ");
    expect(sheet.getCell("F31").value).toBe(" ");
    expect(sheet.getCell("G31").value).toBe(" ");

    // Warnings should be generated
    expect(result.warnings).toContain("plan_length не указан");
    expect(result.warnings).toContain("drill_diameter не указан");
  });

  it("writes space for absent sign3", async () => {
    tmpDir = makeTmpDir();
    const t = makeTestTransition();
    t.signatories.sign3_optional = undefined;

    const result = await renderInternalActs(t, tmpDir);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(result.filePath);
    const sheet = wb.getWorksheet("Лист1")!;

    expect(sheet.getCell("B22").value).toBe(" ");
    expect(sheet.getCell("C22").value).toBe(" ");
  });
});
