/**
 * АОСР renderer — fills "АОСР шаблон.xlsx".
 * 3 sheets: Лист1 (data cells), АОСР(1) (hardcoded), АОСР(2) (hardcoded).
 *
 * Лист1: 10 data cells (B4 is formula, skip).
 * АОСР(1): 15 hardcoded cells (orgs, signatories, project doc).
 * АОСР(2): 9 hardcoded cells (materials, signatories, subsequent works).
 *
 * АОСР(2) also pulls orgs from АОСР(1) via formulas — we fill АОСР(1), АОСР(2) inherits.
 */

import ExcelJS from "exceljs";
import fs from "node:fs";
import path from "node:path";
import {
  AOSR_SHEET1_CELLS,
  AOSR1_CELLS,
  AOSR2_CELLS,
  SHEET_NAMES,
} from "./cell-maps.js";
import {
  formatOrgAosr,
  formatMaterialsAosr,
  formatProjectDocAosr,
} from "../domain/formatters.js";
import type { Transition } from "../domain/types.js";

const TEMPLATE_PATH = path.join(process.cwd(), "templates", "АОСР шаблон.xlsx");

export interface RenderResult {
  filePath: string;
  cellsFilled: number;
  warnings: string[];
}

/**
 * Render АОСР from a Transition domain object.
 */
export async function renderAosr(
  transition: Transition,
  outputDir: string,
): Promise<RenderResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TEMPLATE_PATH);

  const sheet1 = wb.getWorksheet(SHEET_NAMES.aosrSheet1);
  const aosr1 = wb.getWorksheet(SHEET_NAMES.aosr1);
  const aosr2 = wb.getWorksheet(SHEET_NAMES.aosr2);

  if (!sheet1) throw new Error("Лист1 не найден в АОСР шаблоне");
  if (!aosr1) throw new Error("АОСР (1) не найден в АОСР шаблоне");
  if (!aosr2) throw new Error("АОСР (2) не найден в АОСР шаблоне");

  const warnings: string[] = [];
  let cellsFilled = 0;

  function write(sheet: ExcelJS.Worksheet, addr: string, value: unknown): void {
    const v = value !== undefined && value !== null && value !== ""
      ? value
      : " ";
    sheet.getCell(addr).value = v as ExcelJS.CellValue;
    cellsFilled++;
  }

  // Derive act_date (default to end_date)
  const actDate = transition.act_date ?? transition.end_date;

  // === Лист1 — data cells ===
  write(sheet1, AOSR_SHEET1_CELLS.gnb_number_short, transition.gnb_number_short);
  write(sheet1, AOSR_SHEET1_CELLS.profile_length, transition.gnb_params.profile_length);
  write(sheet1, AOSR_SHEET1_CELLS.pipe_count, transition.gnb_params.pipe_count);
  // B4 = formula =C3*B3 — don't touch
  write(sheet1, AOSR_SHEET1_CELLS.address, transition.address);

  // Start date components
  write(sheet1, AOSR_SHEET1_CELLS.start_day, transition.start_date.day);
  write(sheet1, AOSR_SHEET1_CELLS.start_month, transition.start_date.month);
  write(sheet1, AOSR_SHEET1_CELLS.start_year, transition.start_date.year);

  // End date components
  write(sheet1, AOSR_SHEET1_CELLS.end_day, transition.end_date.day);
  write(sheet1, AOSR_SHEET1_CELLS.end_month, transition.end_date.month);
  write(sheet1, AOSR_SHEET1_CELLS.end_year, transition.end_date.year);

  // Act date components
  write(sheet1, AOSR_SHEET1_CELLS.act_day, actDate.day);
  write(sheet1, AOSR_SHEET1_CELLS.act_month, actDate.month);
  write(sheet1, AOSR_SHEET1_CELLS.act_year, actDate.year);

  // === АОСР(1) — hardcoded cells ===
  const { customer, contractor, designer } = transition.organizations;
  const { sign1_customer, sign2_contractor, sign3_optional, tech_supervisor } = transition.signatories;

  write(aosr1, AOSR1_CELLS.object_title, transition.title_line);
  write(aosr1, AOSR1_CELLS.org_customer, formatOrgAosr(customer, "customer"));
  write(aosr1, AOSR1_CELLS.org_contractor, formatOrgAosr(contractor, "contractor"));
  write(aosr1, AOSR1_CELLS.org_designer, formatOrgAosr(designer, "designer"));

  // Signatories — full АОСР lines
  write(aosr1, AOSR1_CELLS.tech_full, tech_supervisor.aosr_full_line);
  write(aosr1, AOSR1_CELLS.sign1_full, sign1_customer.aosr_full_line);
  write(aosr1, AOSR1_CELLS.sign2_full, sign2_contractor.aosr_full_line);
  write(aosr1, AOSR1_CELLS.sign2_control, sign2_contractor.aosr_full_line); // строительный контроль = same person

  if (sign3_optional) {
    write(aosr1, AOSR1_CELLS.sign3_full, sign3_optional.aosr_full_line);
  } else {
    write(aosr1, AOSR1_CELLS.sign3_full, " ");
  }

  // Project documentation
  write(aosr1, AOSR1_CELLS.project_doc, formatProjectDocAosr(designer, transition.project_number));

  // Signatory short names (фамилия + инициалы)
  write(aosr1, AOSR1_CELLS.tech_name, tech_supervisor.full_name);
  write(aosr1, AOSR1_CELLS.sign1_name, sign1_customer.full_name);
  write(aosr1, AOSR1_CELLS.sign2_name, sign2_contractor.full_name);
  write(aosr1, AOSR1_CELLS.sign2_control_name, sign2_contractor.full_name);
  write(aosr1, AOSR1_CELLS.designer_name, " "); // designer representative (not tracked separately yet)
  write(aosr1, AOSR1_CELLS.sign3_name, sign3_optional?.full_name ?? " ");

  // === АОСР(2) — hardcoded cells ===

  if (sign3_optional) {
    write(aosr2, AOSR2_CELLS.sign3_full, sign3_optional.aosr_full_line);
    // A39 = subcontractor org name
    write(aosr2, AOSR2_CELLS.sign3_org_name, sign3_optional.org_description);
  } else {
    write(aosr2, AOSR2_CELLS.sign3_full, " ");
    write(aosr2, AOSR2_CELLS.sign3_org_name, " ");
  }

  // Materials string
  write(aosr2, AOSR2_CELLS.materials, formatMaterialsAosr(transition.pipe, transition.materials));

  // Subsequent works (hardcoded default for GNB)
  write(aosr2, AOSR2_CELLS.subsequent_works, "Прокладке кабельных линий");

  // Signatory short names in АОСР(2)
  write(aosr2, AOSR2_CELLS.tech_name, tech_supervisor.full_name);
  write(aosr2, AOSR2_CELLS.sign1_name, sign1_customer.full_name);
  write(aosr2, AOSR2_CELLS.sign2_name, sign2_contractor.full_name);
  write(aosr2, AOSR2_CELLS.sign2_control_name, sign2_contractor.full_name);
  write(aosr2, AOSR2_CELLS.designer_name, " "); // designer representative (not tracked separately yet)
  write(aosr2, AOSR2_CELLS.sign3_name, sign3_optional?.full_name ?? " ");

  // Write output
  fs.mkdirSync(outputDir, { recursive: true });
  const filePath = path.join(outputDir, `АОСР ОЭК-ГНБ ${transition.gnb_number_short}.xlsx`);
  await wb.xlsx.writeFile(filePath);

  return { filePath, cellsFilled, warnings };
}
