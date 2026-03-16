import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import ExcelJS from "exceljs";
import { renderAosr } from "../../src/renderer/aosr.js";
import { makeTestTransition } from "./fixtures.js";

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "gnb-render-aosr-"));
}

describe("renderAosr", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("produces an xlsx file with correct filename", async () => {
    tmpDir = makeTmpDir();
    const result = await renderAosr(makeTestTransition(), tmpDir);

    expect(result.filePath).toContain("АОСР ОЭК-ГНБ 5-5.xlsx");
    expect(fs.existsSync(result.filePath)).toBe(true);
  });

  it("fills Лист1 date components correctly", async () => {
    tmpDir = makeTmpDir();
    const result = await renderAosr(makeTestTransition(), tmpDir);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(result.filePath);
    const sheet1 = wb.getWorksheet("Лист1")!;

    // B2 = gnb_number_short
    expect(sheet1.getCell("B2").value).toBe("5-5");
    // B3 = profile_length
    expect(sheet1.getCell("B3").value).toBe(194.67);
    // C3 = pipe_count
    expect(sheet1.getCell("C3").value).toBe(2);
    // Start date components
    expect(sheet1.getCell("C6").value).toBe(10);
    expect(sheet1.getCell("D6").value).toBe("декабря");
    expect(sheet1.getCell("E6").value).toBe(2025);
    // End date components
    expect(sheet1.getCell("C7").value).toBe(22);
    expect(sheet1.getCell("D7").value).toBe("декабря");
    expect(sheet1.getCell("E7").value).toBe(2025);
  });

  it("fills АОСР(1) org and signatory cells", async () => {
    tmpDir = makeTmpDir();
    const t = makeTestTransition();
    const result = await renderAosr(t, tmpDir);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(result.filePath);
    const aosr1 = wb.getWorksheet("АОСР (1)")!;

    // A4 = title_line
    expect(aosr1.getCell("A4").value).toBe("Строительство КЛ 10кВ методом ГНБ");
    // A22 = tech full line
    expect(aosr1.getCell("A22").value).toContain("Гайдуков Н.И.");
    // A24 = sign1 full line
    expect(aosr1.getCell("A24").value).toContain("Коробков Ю.Н.");
    // A27 and A30 = sign2 full line (same person for contractor and construction control)
    expect(aosr1.getCell("A27").value).toBe(aosr1.getCell("A30").value);
    // A73 = sign1 name
    expect(aosr1.getCell("A73").value).toBe("Коробков Ю.Н.");
    // A76 = sign2 name
    expect(aosr1.getCell("A76").value).toBe("Буряк А.М.");
  });

  it("fills АОСР(2) materials and subsequent works", async () => {
    tmpDir = makeTmpDir();
    const result = await renderAosr(makeTestTransition(), tmpDir);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(result.filePath);
    const aosr2 = wb.getWorksheet("АОСР (2)")!;

    // A49 = materials
    const materials = aosr2.getCell("A49").value as string;
    expect(materials).toContain("ЭЛЕКТРОПАЙП 225/170");
    // A59 = subsequent works
    expect(aosr2.getCell("A59").value).toBe("Прокладке кабельных линий");
  });

  it("writes space for absent sign3 across all sheets", async () => {
    tmpDir = makeTmpDir();
    const t = makeTestTransition();
    t.signatories.sign3_optional = undefined;

    const result = await renderAosr(t, tmpDir);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(result.filePath);
    const aosr1 = wb.getWorksheet("АОСР (1)")!;
    const aosr2 = wb.getWorksheet("АОСР (2)")!;

    // АОСР(1) sign3 cells
    expect(aosr1.getCell("A36").value).toBe(" ");
    expect(aosr1.getCell("A86").value).toBe(" ");
    // АОСР(2) sign3 cells
    expect(aosr2.getCell("A36").value).toBe(" ");
    expect(aosr2.getCell("A39").value).toBe(" ");
    expect(aosr2.getCell("A85").value).toBe(" ");
  });

  it("uses end_date as act_date when act_date not set", async () => {
    tmpDir = makeTmpDir();
    const t = makeTestTransition();
    t.act_date = undefined;

    const result = await renderAosr(t, tmpDir);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(result.filePath);
    const sheet1 = wb.getWorksheet("Лист1")!;

    // Act date = end_date (day 22, декабря, 2025)
    expect(sheet1.getCell("C8").value).toBe(22);
    expect(sheet1.getCell("D8").value).toBe("декабря");
    expect(sheet1.getCell("E8").value).toBe(2025);
  });
});
