import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import ExcelJS from "exceljs";
import { renderInternalActs } from "../../src/renderer/internal-acts.js";
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

  it("fills all data cells", async () => {
    tmpDir = makeTmpDir();
    const result = await renderInternalActs(makeTestTransition(), tmpDir);

    // 38 cells: 8 ident + 5 orgs + 9 sign (3×3) + 2 pipe + 6 gnb + 2 SRO + 6 additional
    expect(result.cellsFilled).toBe(38);
  });

  it("writes correct identification values", async () => {
    tmpDir = makeTmpDir();
    const result = await renderInternalActs(makeTestTransition(), tmpDir);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(result.filePath);
    const sheet = wb.getWorksheet("Лист1")!;

    expect(sheet.getCell("B4").value).toBe("Строительство КЛ 10кВ методом ГНБ");
    expect(sheet.getCell("B5").value).toBe("г. Москва, Огородный проезд, д. 11");
    expect(sheet.getCell("B6").value).toBe("ЗП № 5-5");
    expect(sheet.getCell("B7").value).toBe("ШФ-123");
    expect(sheet.getCell("B8").value).toBe("«10» декабря 2025 г.");
    expect(sheet.getCell("B9").value).toBe("«22» декабря 2025 г.");
    expect(sheet.getCell("B10").value).toBe("ООО «СПЕЦИНЖСТРОЙ»");
    expect(sheet.getCell("B11").value).toBe("«22» декабря 2025 г.");
  });

  it("writes correct organization values", async () => {
    tmpDir = makeTmpDir();
    const result = await renderInternalActs(makeTestTransition(), tmpDir);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(result.filePath);
    const sheet = wb.getWorksheet("Лист1")!;

    expect(sheet.getCell("B14").value).toBe("АО «ОЭК»");
    expect(sheet.getCell("A15").value).toBe("Подрядчик");
    expect(sheet.getCell("B15").value).toBe("АНО «ОЭК Стройтрест»");
    expect(sheet.getCell("A16").value).toBe("Субподрядчик");
    expect(sheet.getCell("B16").value).toBe("ООО «СПЕЦИНЖСТРОЙ»");
  });

  it("writes pipe, gnb params, and SRO values", async () => {
    tmpDir = makeTmpDir();
    const result = await renderInternalActs(makeTestTransition(), tmpDir);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(result.filePath);
    const sheet = wb.getWorksheet("Лист1")!;

    expect(sheet.getCell("B26").value).toBe("Труба ЭЛЕКТРОПАЙП 225/170-N 1250 F2 SDR 13,6");
    expect(sheet.getCell("B27").value).toBe("d=225");
    expect(sheet.getCell("A31").value).toBe("№ 5-5");
    expect(sheet.getCell("B31").value).toBe(61.7);
    expect(sheet.getCell("C31").value).toBe(194.67);
    expect(sheet.getCell("D31").value).toBe(2);
    expect(sheet.getCell("F31").value).toBe(350);
    expect(sheet.getCell("G31").value).toBe("d=225 2шт");
    expect(sheet.getCell("B33").value).toBe("СРО-С-265-10042013");
    expect(sheet.getCell("B34").value).toBe("22.12.2020");
  });

  // === Signatory scenarios ===

  it("scenario: 3 signatories — all cells filled correctly", async () => {
    tmpDir = makeTmpDir();
    const result = await renderInternalActs(makeTestTransition(), tmpDir);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(result.filePath);
    const sheet = wb.getWorksheet("Лист1")!;

    // sign1: B20=desc, C20=position, D20=name
    expect(sheet.getCell("B20").value).toContain("Представитель");
    expect(sheet.getCell("B20").value).toContain("АО «ОЭК»");
    expect(sheet.getCell("C20").value).toBe("Мастер по ЭРС СВРЭС");
    expect(sheet.getCell("D20").value).toBe("Коробков Ю.Н.");

    // sign2: with sign3 → "подрядной организации"
    expect(sheet.getCell("B21").value).toBe("Представитель подрядной организации АНО «ОЭК Стройтрест»");
    expect(sheet.getCell("C21").value).toBe("Начальник участка");
    expect(sheet.getCell("D21").value).toBe("Буряк А.М.");

    // sign3: subcontractor
    expect(sheet.getCell("B22").value).toBe("Представитель субподрядной организации ООО «СПЕЦИНЖСТРОЙ»");
    expect(sheet.getCell("C22").value).toBe("Начальник участка");
    expect(sheet.getCell("D22").value).toBe("Щеглов Р.А.");
  });

  it("scenario: 2 signatories — sign3 empty, sign2 short label", async () => {
    tmpDir = makeTmpDir();
    const t = makeTestTransition();
    t.signatories.sign3_optional = undefined;

    const result = await renderInternalActs(t, tmpDir);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(result.filePath);
    const sheet = wb.getWorksheet("Лист1")!;

    // sign1 — unchanged
    expect(sheet.getCell("D20").value).toBe("Коробков Ю.Н.");

    // sign2 — without sign3, just "Представитель [org]"
    expect(sheet.getCell("B21").value).toBe("Представитель АНО «ОЭК Стройтрест»");
    expect(sheet.getCell("C21").value).toBe("Начальник участка");
    expect(sheet.getCell("D21").value).toBe("Буряк А.М.");

    // sign3 — empty
    expect(sheet.getCell("B22").value).toBe(" ");
    expect(sheet.getCell("C22").value).toBe(" ");
    expect(sheet.getCell("D22").value).toBe(" ");
  });

  it("2 signatories — no residual data in sign3 cells", async () => {
    tmpDir = makeTmpDir();
    const t = makeTestTransition();
    t.signatories.sign3_optional = undefined;

    const result = await renderInternalActs(t, tmpDir);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(result.filePath);
    const sheet = wb.getWorksheet("Лист1")!;

    expect(sheet.getCell("B22").value).toBe(" ");
    expect(sheet.getCell("C22").value).toBe(" ");
    expect(sheet.getCell("D22").value).toBe(" ");
  });

  it("warnings for missing optional gnb params", async () => {
    tmpDir = makeTmpDir();
    const t = makeTestTransition();
    t.gnb_params.plan_length = undefined;
    t.gnb_params.drill_diameter = undefined;

    const result = await renderInternalActs(t, tmpDir);

    expect(result.warnings).toContain("plan_length не указан");
    expect(result.warnings).toContain("drill_diameter не указан");
  });
});
