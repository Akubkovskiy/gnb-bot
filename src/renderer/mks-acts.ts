/**
 * МКС АОСР+РЭР renderer — fills «МКС АОСР+РЭР шаблон.xlsx».
 *
 * Architecture: write ONLY to Лист1. All 17 act/РЭР sheets reference Лист1
 * via Excel formulas (='Лист1'!A2, =CONCATENATE('Лист1'!A14," ",'Лист1'!A15), etc.)
 * and recalculate automatically when opened in Excel.
 *
 * Лист1 data-entry map (rows 2–88):
 *   A2          object_title
 *   A4+A5       МКС org (hardcoded in template — не трогаем)
 *   A7          contractor_org_name
 *   A8          contractor_org_details
 *   A10         designer_org_name
 *   A11         designer_org_details
 *   A14+A15     mks_rep.full_line + full_line_2
 *   A17+A18     contractor1.full_line + full_line_2
 *   A20+A21     contractor2.full_line + full_line_2
 *   A23+A24     designer_rep.full_line + full_line_2
 *   A26+A27     executor_rep.full_line + full_line_2
 *   A28+A29     executor_org_name + executor_org_details
 *   A31+A32     rer_rep.full_line + full_line_2
 *   B35         mks_rep.short_name
 *   B37         contractor1.short_name
 *   B39         contractor2.short_name
 *   B41         designer_rep.short_name
 *   B43         executor_rep.short_name
 *   B45         rer_rep.short_name
 *   C47         rer_department
 *   C48         address
 *   C49+C71     transition_number (same value, used for act numbering)
 *   C50         dates.start  (дата начала; all intermediate dates derived by formulas)
 *   C51         dates.end    (дата окончания)
 *   C53         length_m
 *   C54         pipe_count
 *   C55         pipe_diameter_mm
 *   C56         "<count>(<word>) труб (<pipe_mark>)"
 *   C58         bentonite_qty_l
 *   C59         polymer_qty_l
 *   C60         final_expansion_mm
 *   C61         pipe_mark
 *   C62         pipe_docs
 *   C63         bentonite_info
 *   C64         polymer_info
 *   C65         plugs_info
 *   C67         designer_short
 *   C68         project_code
 *   C69         contractor_short
 */

import XLSX from "xlsx";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { MksActsInput, MksPerson } from "../domain/mks-types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = path.join(__dirname, "../../templates", "МКС АОСР+РЭР шаблон.xlsx");

export interface MksRenderResult {
  filePath: string;
  /** Number of Лист1 cells written */
  cellsWritten: number;
}

// ---------------------------------------------------------------------------
// Cell helpers — spread existing to preserve style index
// ---------------------------------------------------------------------------

/**
 * Excel serial date. Standard formula: 25569 = days from Excel epoch (Dec 30 1899)
 * to Unix epoch (Jan 1 1970), accounting for Excel's 1900 leap-year bug.
 */
function toExcelDate(d: Date): number {
  return Math.floor(25569.0 + d.getTime() / 86400000);
}

/** Write string cell, preserving existing style */
function ws_s(ws: XLSX.WorkSheet, addr: string, value: string): void {
  const existing = ws[addr] as XLSX.CellObject | undefined;
  ws[addr] = { ...(existing ?? {}), v: value, t: "s" };
  // Remove formula so our value is not overwritten by stale formula cache
  if ((ws[addr] as XLSX.CellObject).f) {
    delete (ws[addr] as XLSX.CellObject).f;
  }
}

/** Write number cell, preserving existing style */
function ws_n(ws: XLSX.WorkSheet, addr: string, value: number): void {
  const existing = ws[addr] as XLSX.CellObject | undefined;
  ws[addr] = { ...(existing ?? {}), v: value, t: "n" };
  if ((ws[addr] as XLSX.CellObject).f) {
    delete (ws[addr] as XLSX.CellObject).f;
  }
}

/** Write date cell as Excel serial number with date format, preserving style */
function ws_d(ws: XLSX.WorkSheet, addr: string, date: Date): void {
  const existing = ws[addr] as XLSX.CellObject | undefined;
  ws[addr] = { ...(existing ?? {}), v: toExcelDate(date), t: "n", z: "DD.MM.YYYY" };
  if ((ws[addr] as XLSX.CellObject).f) {
    delete (ws[addr] as XLSX.CellObject).f;
  }
}

/** Write string only if value is provided (skip if undefined/empty) */
function ws_s_opt(ws: XLSX.WorkSheet, addr: string, value: string | undefined): void {
  if (value !== undefined && value !== "") ws_s(ws, addr, value);
}

// ---------------------------------------------------------------------------
// Main renderer
// ---------------------------------------------------------------------------

export async function renderMksActs(
  input: MksActsInput,
  outputDir: string,
): Promise<MksRenderResult> {
  const wb = XLSX.readFile(TEMPLATE_PATH, { cellStyles: true, cellFormula: true });
  const s1 = wb.Sheets["Лист1"];
  if (!s1) throw new Error("Лист1 не найден в шаблоне МКС АОСР+РЭР");

  let cellsWritten = 0;
  const w = (addr: string, value: string | number | Date | undefined) => {
    if (value === undefined) return;
    if (value instanceof Date) { ws_d(s1, addr, value); }
    else if (typeof value === "number") { ws_n(s1, addr, value); }
    else { ws_s(s1, addr, value); }
    cellsWritten++;
  };

  // --- A2: object title ---
  w("A2", input.object_title);

  // --- A4+A5: МКС org — hardcoded in template, do NOT overwrite ---

  // --- A7+A8: Подрядчик-строитель ---
  w("A7", input.contractor_org_name);
  w("A8", input.contractor_org_details);

  // --- A10+A11: Проектировщик ---
  w("A10", input.designer_org_name);
  w("A11", input.designer_org_details);

  // --- A14+A15: Представитель МКС ---
  w("A14", personLine1(input.mks_rep));
  ws_s_opt(s1, "A15", personLine2(input.mks_rep)); if (personLine2(input.mks_rep)) cellsWritten++;

  // --- A17+A18: Подрядчик-1 (строительный контроль) ---
  w("A17", personLine1(input.contractor1));
  ws_s_opt(s1, "A18", personLine2(input.contractor1)); if (personLine2(input.contractor1)) cellsWritten++;

  // --- A20+A21: Подрядчик-2 ---
  w("A20", personLine1(input.contractor2));
  ws_s_opt(s1, "A21", personLine2(input.contractor2)); if (personLine2(input.contractor2)) cellsWritten++;

  // --- A23+A24: Проектировщик-представитель ---
  w("A23", personLine1(input.designer_rep));
  ws_s_opt(s1, "A24", personLine2(input.designer_rep)); if (personLine2(input.designer_rep)) cellsWritten++;

  // --- A26+A27: Исполнитель (представитель) ---
  w("A26", personLine1(input.executor_rep));
  ws_s_opt(s1, "A27", personLine2(input.executor_rep)); if (personLine2(input.executor_rep)) cellsWritten++;

  // --- A28+A29: Исполнитель (организация) ---
  w("A28", input.executor_org_name);
  w("A29", input.executor_org_details);

  // --- A31+A32: РЭР ---
  w("A31", personLine1(input.rer_rep));
  ws_s_opt(s1, "A32", personLine2(input.rer_rep)); if (personLine2(input.rer_rep)) cellsWritten++;

  // --- Short names for signature rows ---
  w("B35", input.mks_rep.short_name);
  w("B37", input.contractor1.short_name);
  w("B39", input.contractor2.short_name);
  w("B41", input.designer_rep.short_name);
  w("B43", input.executor_rep.short_name);
  w("B45", input.rer_rep.short_name);

  // --- Transition data ---
  w("C47", input.rer_department);
  w("C48", input.address);
  w("C49", input.transition_number);
  w("C71", input.transition_number); // duplicate used by act schedule formulas

  // --- Dates: only start and end — all intermediate dates calculated by Лист1 formulas ---
  w("C50", input.dates.start);
  w("C51", input.dates.end);

  // --- Technical parameters ---
  w("C53", input.length_m);
  w("C54", input.pipe_count);
  w("C55", input.pipe_diameter_mm);
  // C56: "<N>(<word>) труб (<mark>)"
  w("C56", `${input.pipe_count}(${numToRu(input.pipe_count)}) труб (${input.pipe_mark})`);
  // C57 = formula =C53*C54 — leave as-is, Excel recalculates
  w("C58", input.bentonite_qty_l);
  w("C59", input.polymer_qty_l);
  w("C60", input.final_expansion_mm);
  w("C61", input.pipe_mark);
  w("C62", input.pipe_docs);
  w("C63", input.bentonite_info);
  w("C64", input.polymer_info);
  w("C65", input.plugs_info);

  // --- Project refs ---
  w("C67", input.designer_short);
  w("C68", input.project_code);
  w("C69", input.contractor_short);

  // K72: copy count — keep template default (2), do not overwrite

  // --- Write output ---
  fs.mkdirSync(outputDir, { recursive: true });
  const transNum = input.transition_number.replace(/[№#\s]/g, "");
  const filePath = path.join(outputDir, `МКС АОСР+РЭР ЗП ${transNum}.xlsx`);
  XLSX.writeFile(wb, filePath, { bookType: "xlsx", cellStyles: true });

  return { filePath, cellsWritten };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function numToRu(n: number): string {
  const words: Record<number, string> = {
    1: "одной", 2: "двух", 3: "трёх", 4: "четырёх", 5: "пяти", 6: "шести",
  };
  return words[n] ?? String(n);
}

/**
 * Build Лист1 A-row line 1 for a person: "${position} ${name}"
 * Maps to e.g. A14 for mks_rep.
 */
function personLine1(p: MksPerson): string {
  return `${p.position} ${p.name}`;
}

/**
 * Build Лист1 A-row line 2 for a person: combines inrs + order with double space.
 * Maps to e.g. A15 for mks_rep. Returns undefined if both inrs and order are absent.
 */
function personLine2(p: MksPerson): string | undefined {
  const parts = [p.inrs, p.order].filter(Boolean) as string[];
  return parts.length > 0 ? parts.join("  ") : undefined;
}
