/**
 * Internal Acts renderer — fills Лист1 of "Акты ГНБ шаблон v2.xlsx".
 * 11 sheets total, only Лист1 is filled by bot.
 * Other 10 sheets update via formulas referencing Лист1.
 *
 * Phase 0 Finding #1: Template contains residual data.
 * ALL 27 data cells must be written — empty values get " " (space).
 */

import ExcelJS from "exceljs";
import fs from "node:fs";
import path from "node:path";
import { INTERNAL_ACTS_CELLS, SHEET_NAMES } from "./cell-maps.js";
import { formatDateInternal, formatSignatoryDesc, formatSignatorySign } from "../domain/formatters.js";
import type { Transition } from "../domain/types.js";

const TEMPLATE_PATH = path.join(process.cwd(), "templates", "Акты ГНБ шаблон v2.xlsx");

export interface RenderResult {
  filePath: string;
  cellsFilled: number;
  warnings: string[];
}

/**
 * Render internal acts from a Transition domain object.
 * Returns path to generated .xlsx file.
 */
export async function renderInternalActs(
  transition: Transition,
  outputDir: string,
): Promise<RenderResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TEMPLATE_PATH);

  const sheet = wb.getWorksheet(SHEET_NAMES.internalActs)!;
  if (!sheet) throw new Error("Лист1 не найден в шаблоне внутренних актов");

  const warnings: string[] = [];
  let cellsFilled = 0;

  // Helper: write a value to a cell, using " " for empty
  function writeCell(addr: string, value: unknown): void {
    const v = value !== undefined && value !== null && value !== ""
      ? value
      : " ";
    sheet.getCell(addr).value = v as ExcelJS.CellValue;
    cellsFilled++;
  }

  // Derive act_date (default to end_date)
  const actDate = transition.act_date ?? transition.end_date;

  // Customer display: "СВРЭС АО «ОЭК»" (department + short_name)
  const cust = transition.organizations.customer;
  const customerDisplay = cust.department && cust.short_name
    ? `${cust.department} ${cust.short_name}`
    : cust.short_name ?? cust.name;

  // === Write all cells ===

  // Identification
  writeCell(INTERNAL_ACTS_CELLS.title_line, transition.title_line);
  writeCell(INTERNAL_ACTS_CELLS.object_name, transition.object_name);
  writeCell(INTERNAL_ACTS_CELLS.address, transition.address);
  writeCell(INTERNAL_ACTS_CELLS.gnb_number, transition.gnb_number);
  writeCell(INTERNAL_ACTS_CELLS.project_number, transition.project_number);
  writeCell(INTERNAL_ACTS_CELLS.start_date, formatDateInternal(transition.start_date));
  writeCell(INTERNAL_ACTS_CELLS.end_date, formatDateInternal(transition.end_date));
  writeCell(INTERNAL_ACTS_CELLS.executor, transition.executor);
  writeCell(INTERNAL_ACTS_CELLS.completion_date, formatDateInternal(actDate));

  // Organizations
  writeCell(INTERNAL_ACTS_CELLS.customer_display, customerDisplay);
  writeCell(INTERNAL_ACTS_CELLS.contractor_display, transition.organizations.contractor.name);
  writeCell(INTERNAL_ACTS_CELLS.designer_display, transition.organizations.designer.name);

  // Signatories
  const { sign1_customer, sign2_contractor, sign3_optional, tech_supervisor } = transition.signatories;

  writeCell(INTERNAL_ACTS_CELLS.sign1_desc, formatSignatoryDesc(sign1_customer));
  writeCell(INTERNAL_ACTS_CELLS.sign1_line, formatSignatorySign(sign1_customer));

  writeCell(INTERNAL_ACTS_CELLS.sign2_desc, formatSignatoryDesc(sign2_contractor));
  writeCell(INTERNAL_ACTS_CELLS.sign2_line, formatSignatorySign(sign2_contractor));

  // sign3 is optional — write " " if absent
  if (sign3_optional) {
    writeCell(INTERNAL_ACTS_CELLS.sign3_desc, formatSignatoryDesc(sign3_optional));
    writeCell(INTERNAL_ACTS_CELLS.sign3_line, formatSignatorySign(sign3_optional));
  } else {
    writeCell(INTERNAL_ACTS_CELLS.sign3_desc, " ");
    writeCell(INTERNAL_ACTS_CELLS.sign3_line, " ");
  }

  writeCell(INTERNAL_ACTS_CELLS.tech_desc, formatSignatoryDesc(tech_supervisor));
  writeCell(INTERNAL_ACTS_CELLS.tech_line, formatSignatorySign(tech_supervisor));

  // Pipe
  writeCell(INTERNAL_ACTS_CELLS.pipe_mark, transition.pipe.mark);
  writeCell(INTERNAL_ACTS_CELLS.pipe_diameter, transition.pipe.diameter);

  // GNB params
  writeCell(INTERNAL_ACTS_CELLS.gnb_number_table, transition.gnb_number);
  writeCell(INTERNAL_ACTS_CELLS.plan_length, transition.gnb_params.plan_length);
  writeCell(INTERNAL_ACTS_CELLS.profile_length, transition.gnb_params.profile_length);
  writeCell(INTERNAL_ACTS_CELLS.pipe_count, transition.gnb_params.pipe_count);
  writeCell(INTERNAL_ACTS_CELLS.drill_diameter, transition.gnb_params.drill_diameter);
  writeCell(INTERNAL_ACTS_CELLS.configuration, transition.gnb_params.configuration);

  // Warnings for missing optional fields
  if (!transition.gnb_params.plan_length) warnings.push("plan_length не указан");
  if (!transition.gnb_params.drill_diameter) warnings.push("drill_diameter не указан");
  if (!transition.gnb_params.configuration) warnings.push("configuration не указана");

  // Write output
  fs.mkdirSync(outputDir, { recursive: true });
  const filePath = path.join(outputDir, `Акты ЗП ГНБ ${transition.gnb_number_short}.xlsx`);
  await wb.xlsx.writeFile(filePath);

  return { filePath, cellsFilled, warnings };
}
