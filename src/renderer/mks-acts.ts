/**
 * МКС АОСР+РЭР renderer — fills «МКС АОСР+РЭР шаблон.xlsx».
 * Uses SheetJS (xlsx) for read/write to avoid Excel corruption issues with ExcelJS.
 */

import XLSX from "xlsx";
import fs from "node:fs";
import path from "node:path";
import type { MksActsInput } from "../domain/mks-types.js";

const TEMPLATE_PATH = path.join(process.cwd(), "templates", "МКС АОСР+РЭР шаблон.xlsx");

export interface MksRenderResult {
  filePath: string;
  sheetsWritten: number;
}

// Excel serial date (days since 1899-12-30, with Excel's 1900 leap-year bug)
function toExcelDate(d: Date): number {
  return Math.floor((d.getTime() - Date.UTC(1899, 11, 30)) / 86400000);
}

function fmt(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}

function s(ws: XLSX.WorkSheet, addr: string, value: string | number) {
  const type = typeof value === "number" ? "n" : "s";
  const existing = ws[addr] as XLSX.CellObject | undefined;
  ws[addr] = { ...(existing ?? {}), v: value, t: type };
}

function d(ws: XLSX.WorkSheet, addr: string, date: Date) {
  const existing = ws[addr] as XLSX.CellObject | undefined;
  ws[addr] = { ...(existing ?? {}), v: toExcelDate(date), t: "n", z: "DD.MM.YYYY" };
}

export async function renderMksActs(
  input: MksActsInput,
  outputDir: string,
): Promise<MksRenderResult> {
  const wb = XLSX.readFile(TEMPLATE_PATH, { cellStyles: true });
  let sheetsWritten = 0;
  const { dates } = input;

  // === Лист1 — master data ===
  const s1 = wb.Sheets["Лист1"];
  if (!s1) throw new Error("Лист1 не найден в шаблоне МКС");

  s(s1, "A2",  input.object_title);
  s(s1, "A7",  input.contractor_org_line);
  s(s1, "A10", input.designer_org_line);
  s(s1, "A14", input.mks_rep.full_line);
  s(s1, "A17", input.contractor1.full_line);
  s(s1, "A20", input.contractor2.full_line);
  s(s1, "A23", input.designer_rep.full_line);
  s(s1, "A26", input.executor_rep.full_line);
  s(s1, "A28", input.executor_org_name);
  s(s1, "A29", input.executor_org_line);
  s(s1, "A31", input.rer_rep.full_line);

  s(s1, "B35", input.mks_rep.short_name);
  s(s1, "B37", input.contractor1.short_name);
  s(s1, "B39", input.contractor2.short_name);
  s(s1, "B41", input.designer_rep.short_name);
  s(s1, "B43", input.executor_rep.short_name);
  s(s1, "B45", input.rer_rep.short_name);

  s(s1, "C47", input.rer_department);
  s(s1, "C48", input.address);
  s(s1, "C49", input.transition_number);
  d(s1, "C50", dates.survey);
  d(s1, "C51", dates.final);
  s(s1, "C71", input.transition_number);

  s(s1, "C53", input.length_m);
  s(s1, "C54", input.pipe_count);
  s(s1, "C55", input.pipe_diameter_mm);
  s(s1, "C56", `${input.pipe_count}(${numToRu(input.pipe_count)}) труб (${input.pipe_mark})`);
  s(s1, "C58", input.bentonite_qty_l);
  s(s1, "C59", input.polymer_qty_l);
  s(s1, "C60", input.final_expansion_mm);
  s(s1, "C61", input.pipe_mark);
  s(s1, "C62", input.pipe_docs);
  s(s1, "C63", input.bentonite_info);
  s(s1, "C64", input.polymer_info);
  s(s1, "C65", input.plugs_info);
  s(s1, "C67", input.designer_short);
  s(s1, "C68", input.project_code);
  s(s1, "C69", input.contractor_short);

  sheetsWritten++;

  // === АОСР sheets ===
  type ActDef = {
    sheet: string; actNum: string; date: Date;
    startDate: Date; endDate: Date; sigRows: "razb" | "std";
  };

  const actDefs: ActDef[] = [
    { sheet: "1.АОСР разбивка",          actNum: `${input.transition_number}/1`,  date: dates.survey,    startDate: dates.survey,    endDate: dates.survey,    sigRows: "razb" },
    { sheet: "2.АОСР котлованы",         actNum: `${input.transition_number}/2`,  date: dates.pits,      startDate: dates.pits,      endDate: dates.pits,      sigRows: "std" },
    { sheet: "3.АОСР пилот",             actNum: `${input.transition_number}/3`,  date: dates.pilot,     startDate: dates.pilot,     endDate: dates.pilot,     sigRows: "std" },
    { sheet: "4.АОСР Расширение",        actNum: `${input.transition_number}/4`,  date: dates.expansion, startDate: dates.pits,      endDate: dates.expansion, sigRows: "std" },
    { sheet: "5.АОСР протягивание",      actNum: `${input.transition_number}/5`,  date: dates.pullback,  startDate: dates.pullback,  endDate: dates.pullback,  sigRows: "std" },
    { sheet: "6.АОСР соосность",         actNum: `${input.transition_number}/6`,  date: dates.final,     startDate: dates.final,     endDate: dates.final,     sigRows: "std" },
    { sheet: "7.АОСР проходимость",      actNum: `${input.transition_number}/7`,  date: dates.final,     startDate: dates.final,     endDate: dates.final,     sigRows: "std" },
    { sheet: "8.АОСР герметизация",      actNum: `${input.transition_number}/8`,  date: dates.final,     startDate: dates.final,     endDate: dates.final,     sigRows: "std" },
    { sheet: "9.АОСР котлованы засыпка", actNum: `${input.transition_number}/9`,  date: dates.final,     startDate: dates.final,     endDate: dates.final,     sigRows: "std" },
    { sheet: "10.АОСР устройство",       actNum: `${input.transition_number}/10`, date: dates.final,     startDate: dates.survey,    endDate: dates.final,     sigRows: "std" },
  ];

  for (const def of actDefs) {
    const ws = wb.Sheets[def.sheet];
    if (!ws) continue;

    s(ws, "A2",  input.object_title);
    s(ws, "A5",  `МКС – филиал ПАО «Россети Московский регион» ОГРН 1057746555811, ИНН 5036065113, 115114, г. Москва, 2-й Павелецкий проезд, дом 3, корп.2; тел/факс 8(495)668-22-28`);
    s(ws, "A8",  input.contractor_org_line);
    s(ws, "A11", input.designer_org_line);
    s(ws, "A17", def.actNum);
    d(ws, "L17", def.date);
    s(ws, "A20", input.mks_rep.full_line);
    s(ws, "A23", input.contractor2.full_line);
    s(ws, "A26", input.contractor1.full_line);
    s(ws, "A29", input.designer_rep.full_line);
    s(ws, "A32", input.executor_rep.full_line);
    s(ws, "A35", input.rer_rep.full_line);
    s(ws, "A38", input.executor_org_name);
    d(ws, "D53", def.startDate);
    d(ws, "D54", def.endDate);

    if (def.sigRows === "razb") {
      s(ws, "A61", input.mks_rep.short_name);
      s(ws, "A64", input.contractor2.short_name);
      s(ws, "A67", input.contractor1.short_name);
      s(ws, "A70", input.designer_rep.short_name);
      s(ws, "A73", input.executor_rep.short_name);
      s(ws, "A76", input.rer_rep.short_name);
    } else {
      s(ws, "A69", input.mks_rep.short_name);
      s(ws, "A72", input.contractor2.short_name);
      s(ws, "A75", input.contractor1.short_name);
      s(ws, "A78", input.designer_rep.short_name);
      s(ws, "A81", input.executor_rep.short_name);
      s(ws, "A84", input.rer_rep.short_name);
    }

    sheetsWritten++;
  }

  // === РЭР sheets ===
  const rerDefs = [
    { sheet: "1_РЭР_Осмотр труб", date: dates.expansion },
    { sheet: "2_РЭР_Сварка",       date: dates.expansion },
    { sheet: "3_РЭР_Трубопровод",  date: dates.expansion },
    { sheet: "4_РЭР_Надзор",       date: dates.survey    },
    { sheet: "5_РЭР_ПКЛ",         date: dates.final     },
    { sheet: "6_РЭР_Опись",        date: dates.final     },
  ];

  for (const def of rerDefs) {
    const ws = wb.Sheets[def.sheet];
    if (!ws) continue;

    s(ws, "A2", input.object_title);
    s(ws, "A4", `МКС – филиал ПАО «Россети Московский регион»`);
    s(ws, "A6", input.contractor_org_line);
    d(ws, "L10", def.date);

    sheetsWritten++;
  }

  // Write output
  fs.mkdirSync(outputDir, { recursive: true });
  const transNum = input.transition_number.replace(/[№#\s]/g, "");
  const filePath = path.join(outputDir, `МКС АОСР+РЭР ЗП ${transNum}.xlsx`);
  XLSX.writeFile(wb, filePath, { bookType: "xlsx", cellStyles: true });

  return { filePath, sheetsWritten };
}

function numToRu(n: number): string {
  const words: Record<number, string> = { 1: "одной", 2: "двух", 3: "трёх", 4: "четырёх", 5: "пяти", 6: "шести" };
  return words[n] ?? String(n);
}
