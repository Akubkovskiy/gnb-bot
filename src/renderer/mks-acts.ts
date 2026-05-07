/**
 * МКС АОСР+РЭР renderer — fills «МКС АОСР+РЭР шаблон.xlsx».
 *
 * Template structure: 18 sheets
 *   Лист1         — master data sheet (params + registry table via formulas)
 *   1.АОСР разбивка … 10.АОСР устройство — individual hidden-works acts
 *   1_РЭР_Осмотр труб … 6_РЭР_Опись     — РЭР inspection acts
 *
 * Strategy: fill Лист1 with all org/signatory/param data (act sheets reference
 * Лист1 via formulas and recalculate on Excel open). Per-sheet: fill act number,
 * date, and start/end dates. Write formula-cached values directly so PDFs
 * generated without Excel also show correct data.
 */

import ExcelJS from "exceljs";
import fs from "node:fs";
import path from "node:path";
import type { MksActsInput } from "../domain/mks-types.js";

const TEMPLATE_PATH = path.join(process.cwd(), "templates", "МКС АОСР+РЭР шаблон.xlsx");

export interface MksRenderResult {
  filePath: string;
  sheetsWritten: number;
}

// Excel serial date: days since 1900-01-01 (with Excel's 1900 leap year bug offset)
function toExcelDate(d: Date): number {
  return Math.floor((d.getTime() - Date.UTC(1899, 11, 30)) / 86400000);
}

function fmt(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}

export async function renderMksActs(
  input: MksActsInput,
  outputDir: string,
): Promise<MksRenderResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TEMPLATE_PATH);

  let sheetsWritten = 0;
  const { dates } = input;

  // === Fill Лист1 — master data ===
  const s1 = wb.getWorksheet("Лист1");
  if (!s1) throw new Error("Лист1 не найден в шаблоне МКС");

  const write1 = (addr: string, v: unknown) => { s1.getCell(addr).value = v as ExcelJS.CellValue; };

  // Object title (row 2 — merged, write to A2)
  write1("A2", input.object_title);

  // МКС org block (rows 4-5 are labels, org data is in row 5 text — keep template row 4 as-is)
  // Contractor org (row 7-8)
  write1("A7", input.contractor_org_line);
  // Designer org (row 10-11)
  write1("A10", input.designer_org_line);

  // МКС rep signatory full lines
  write1("A14", input.mks_rep.full_line);
  write1("A17", input.contractor1.full_line);
  write1("A20", input.contractor2.full_line);
  write1("A23", input.designer_rep.full_line);
  write1("A26", input.executor_rep.full_line);
  write1("A28", input.executor_org_name);
  write1("A29", input.executor_org_line);
  write1("A31", input.rer_rep.full_line);

  // Short names for signature table
  write1("B35", input.mks_rep.short_name);
  write1("B37", input.contractor1.short_name);
  write1("B39", input.contractor2.short_name);
  write1("B41", input.designer_rep.short_name);
  write1("B43", input.executor_rep.short_name);
  write1("B45", input.rer_rep.short_name);

  // РЭР department and address
  write1("C47", input.rer_department);
  write1("C48", input.address);
  write1("C49", input.transition_number);
  write1("C50", dates.survey);
  write1("C51", dates.final);
  write1("C71", input.transition_number);

  // Technical parameters
  write1("C53", input.length_m);
  write1("C54", input.pipe_count);
  write1("C55", input.pipe_diameter_mm);
  write1("C56", `${input.pipe_count}(${numToRu(input.pipe_count)}) труб (${input.pipe_mark})`);
  // C57 = formula C53*C54 — skip
  write1("C58", input.bentonite_qty_l);
  write1("C59", input.polymer_qty_l);
  write1("C60", input.final_expansion_mm);
  write1("C61", input.pipe_mark);
  write1("C62", input.pipe_docs);
  write1("C63", input.bentonite_info);
  write1("C64", input.polymer_info);
  write1("C65", input.plugs_info);

  write1("C67", input.designer_short);
  write1("C68", input.project_code);
  write1("C69", input.contractor_short);

  sheetsWritten++;

  // === Sheet act definitions ===
  type ActDef = {
    sheet: string;
    actNum: string;
    date: Date;
    startDate: Date;
    endDate: Date;
    sigRows: SignatureRows;
  };

  // Разбивка has different signature row layout (see template analysis)
  type SignatureRows = "razb" | "std";

  const actDefs: ActDef[] = [
    { sheet: "1.АОСР разбивка",            actNum: `${input.transition_number}/1`,  date: dates.survey,    startDate: dates.survey,    endDate: dates.survey,    sigRows: "razb" },
    { sheet: "2.АОСР котлованы",           actNum: `${input.transition_number}/2`,  date: dates.pits,      startDate: dates.pits,      endDate: dates.pits,      sigRows: "std" },
    { sheet: "3.АОСР пилот",               actNum: `${input.transition_number}/3`,  date: dates.pilot,     startDate: dates.pilot,     endDate: dates.pilot,     sigRows: "std" },
    { sheet: "4.АОСР Расширение",          actNum: `${input.transition_number}/4`,  date: dates.expansion, startDate: dates.pits,      endDate: dates.expansion, sigRows: "std" },
    { sheet: "5.АОСР протягивание",        actNum: `${input.transition_number}/5`,  date: dates.pullback,  startDate: dates.pullback,  endDate: dates.pullback,  sigRows: "std" },
    { sheet: "6.АОСР соосность",           actNum: `${input.transition_number}/6`,  date: dates.final,     startDate: dates.final,     endDate: dates.final,     sigRows: "std" },
    { sheet: "7.АОСР проходимость",        actNum: `${input.transition_number}/7`,  date: dates.final,     startDate: dates.final,     endDate: dates.final,     sigRows: "std" },
    { sheet: "8.АОСР герметизация",        actNum: `${input.transition_number}/8`,  date: dates.final,     startDate: dates.final,     endDate: dates.final,     sigRows: "std" },
    { sheet: "9.АОСР котлованы засыпка",   actNum: `${input.transition_number}/9`,  date: dates.final,     startDate: dates.final,     endDate: dates.final,     sigRows: "std" },
    { sheet: "10.АОСР устройство",         actNum: `${input.transition_number}/10`, date: dates.final,     startDate: dates.survey,    endDate: dates.final,     sigRows: "std" },
  ];

  for (const def of actDefs) {
    const ws = wb.getWorksheet(def.sheet);
    if (!ws) continue;

    const w = (addr: string, v: unknown) => { ws.getCell(addr).value = v as ExcelJS.CellValue; };

    // Propagate header data directly (overwrite formula cached values)
    w("A2", input.object_title);
    w("A5", `МКС – филиал ПАО «Россети Московский регион» ОГРН 1057746555811, ИНН 5036065113, 115114, г. Москва, 2-й Павелецкий проезд, дом 3, корп.2; тел/факс 8(495)668-22-28`);
    w("A8", input.contractor_org_line);
    w("A11", input.designer_org_line);

    // Act number and date
    w("A17", `${def.actNum}`);
    w("L17", def.date);

    // Signatory full lines
    w("A20", input.mks_rep.full_line);
    w("A23", input.contractor2.full_line);
    w("A26", input.contractor1.full_line);
    w("A29", input.designer_rep.full_line);
    w("A32", input.executor_rep.full_line);
    w("A35", input.rer_rep.full_line);
    w("A38", input.executor_org_name);

    // Work dates
    w("D53", def.startDate);
    w("D54", def.endDate);

    // Signatures (ФИО)
    if (def.sigRows === "razb") {
      w("A61", input.mks_rep.short_name);
      w("A64", input.contractor2.short_name);
      w("A67", input.contractor1.short_name);
      w("A70", input.designer_rep.short_name);
      w("A73", input.executor_rep.short_name);
      w("A76", input.rer_rep.short_name);
    } else {
      w("A69", input.mks_rep.short_name);
      w("A72", input.contractor2.short_name);
      w("A75", input.contractor1.short_name);
      w("A78", input.designer_rep.short_name);
      w("A81", input.executor_rep.short_name);
      w("A84", input.rer_rep.short_name);
    }

    sheetsWritten++;
  }

  // === РЭР sheets ===
  const rerDefs = [
    { sheet: "1_РЭР_Осмотр труб", num: `${input.transition_number}/1/РЭР`, date: dates.expansion },
    { sheet: "2_РЭР_Сварка",       num: `${input.transition_number}/2/РЭР`, date: dates.expansion },
    { sheet: "3_РЭР_Трубопровод",  num: `${input.transition_number}/3/РЭР`, date: dates.expansion },
    { sheet: "4_РЭР_Надзор",       num: `${input.transition_number}/4/РЭР`, date: dates.survey    },
    { sheet: "5_РЭР_ПКЛ",         num: `${input.transition_number}/5/РЭР`, date: dates.final     },
    { sheet: "6_РЭР_Опись",        num: `${input.transition_number}/6/РЭР`, date: dates.final     },
  ];

  for (const def of rerDefs) {
    const ws = wb.getWorksheet(def.sheet);
    if (!ws) continue;

    const w = (addr: string, v: unknown) => { ws.getCell(addr).value = v as ExcelJS.CellValue; };

    w("A2", input.object_title);
    w("A4", `МКС – филиал ПАО «Россети Московский регион»`);
    w("A6", input.contractor_org_line);
    w("L10", def.date);

    sheetsWritten++;
  }

  // Write output
  fs.mkdirSync(outputDir, { recursive: true });
  const transNum = input.transition_number.replace(/[№#\s]/g, "");
  const filePath = path.join(outputDir, `МКС АОСР+РЭР ЗП ${transNum}.xlsx`);
  await wb.xlsx.writeFile(filePath);

  return { filePath, sheetsWritten };
}

function numToRu(n: number): string {
  const words: Record<number, string> = { 1: "одной", 2: "двух", 3: "трёх", 4: "четырёх", 5: "пяти", 6: "шести" };
  return words[n] ?? String(n);
}
