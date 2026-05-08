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
import { formatDateInternal } from "../domain/formatters.js";
import type { Transition } from "../domain/types.js";

const TEMPLATE_PATH = path.join(process.cwd(), "templates", "Акты ГНБ шаблон v2.xlsx");

/**
 * Extract org name from org_description.
 * "Субподрядчик ООО «СПЕЦИНЖСТРОЙ»" → "ООО «СПЕЦИНЖСТРОЙ»"
 * "Представитель АО «ОЭК»" → "АО «ОЭК»"
 */
function extractOrgName(desc: string): string {
  const match = desc.match(/((?:АО|ООО|АНО|ПАО|ЗАО|ГКУ|ОАО|ГУП|МУП)\s*(?:«[^»]+»|"[^"]+"))/);
  return match ? match[1] : desc;
}

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

  // Force Excel to recalculate all formulas on open (print sheets reference Лист1)
  wb.calcProperties = { fullCalcOnLoad: true };

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

  // Shared references
  const cust = transition.organizations.customer;
  const customerDisplay = cust.short_name || cust.name || "";
  const { sign1_customer, sign2_contractor, sign3_optional } = transition.signatories;
  const contr = transition.organizations.contractor;
  const contrName = contr?.short_name || contr?.name || "";

  // === Write all cells ===

  // Identification
  writeCell(INTERNAL_ACTS_CELLS.title_line, transition.title_line);
  // B4 (object_name) removed — not used by any print sheet, B3 (title_line) covers it
  writeCell(INTERNAL_ACTS_CELLS.address, transition.address);
  writeCell(INTERNAL_ACTS_CELLS.gnb_number, transition.gnb_number);
  writeCell(INTERNAL_ACTS_CELLS.project_number, transition.project_number);
  writeCell(INTERNAL_ACTS_CELLS.start_date, formatDateInternal(transition.start_date));
  writeCell(INTERNAL_ACTS_CELLS.end_date, formatDateInternal(transition.end_date));
  writeCell(INTERNAL_ACTS_CELLS.executor, transition.executor);
  writeCell(INTERNAL_ACTS_CELLS.completion_date, formatDateInternal(actDate));

  // Organizations — same contractor/subcontractor logic as signatories
  writeCell(INTERNAL_ACTS_CELLS.customer_display, customerDisplay);
  if (sign3_optional) {
    // 3 signatories: contractor + subcontractor
    writeCell(INTERNAL_ACTS_CELLS.contractor_label, "Подрядчик");
    writeCell(INTERNAL_ACTS_CELLS.contractor_display, contrName);
    const sign3OrgDisplay = extractOrgName(sign3_optional.org_description);
    writeCell(INTERNAL_ACTS_CELLS.sub_label, "Субподрядчик");
    writeCell(INTERNAL_ACTS_CELLS.sub_display, sign3OrgDisplay);
  } else {
    // 2 signatories: just contractor
    writeCell(INTERNAL_ACTS_CELLS.contractor_label, "Подрядчик");
    writeCell(INTERNAL_ACTS_CELLS.contractor_display, contrName);
    writeCell(INTERNAL_ACTS_CELLS.sub_label, " ");
    writeCell(INTERNAL_ACTS_CELLS.sub_display, " ");
  }

  // Signatories
  // B-column: "Представитель [org]" — role depends on whether sign3 exists
  // C-column: position
  // D-column: full_name
  //
  // 2 signatories: sign2 = direct contractor → "Представитель [org]"
  // 3 signatories: sign2 = general contractor → "Представитель подрядной организации [org]"
  //                sign3 = subcontractor     → "Представитель субподрядной организации [org]"
  writeCell(INTERNAL_ACTS_CELLS.sign1_desc, `Представитель ${cust.short_name || cust.name}`);
  writeCell(INTERNAL_ACTS_CELLS.sign1_position, sign1_customer.position);
  writeCell(INTERNAL_ACTS_CELLS.sign1_name, sign1_customer.full_name);

  if (sign3_optional) {
    // 3 signatories: contractor + subcontractor
    writeCell(INTERNAL_ACTS_CELLS.sign2_desc, `Представитель подрядной организации ${contrName}`);
    writeCell(INTERNAL_ACTS_CELLS.sign2_position, sign2_contractor.position);
    writeCell(INTERNAL_ACTS_CELLS.sign2_name, sign2_contractor.full_name);

    const sign3Org = extractOrgName(sign3_optional.org_description);
    writeCell(INTERNAL_ACTS_CELLS.sign3_desc, `Представитель субподрядной организации ${sign3Org}`);
    writeCell(INTERNAL_ACTS_CELLS.sign3_position, sign3_optional.position);
    writeCell(INTERNAL_ACTS_CELLS.sign3_name, sign3_optional.full_name);
  } else {
    // 2 signatories: just contractor
    writeCell(INTERNAL_ACTS_CELLS.sign2_desc, `Представитель ${contrName}`);
    writeCell(INTERNAL_ACTS_CELLS.sign2_position, sign2_contractor.position);
    writeCell(INTERNAL_ACTS_CELLS.sign2_name, sign2_contractor.full_name);

    writeCell(INTERNAL_ACTS_CELLS.sign3_desc, " ");
    writeCell(INTERNAL_ACTS_CELLS.sign3_position, " ");
    writeCell(INTERNAL_ACTS_CELLS.sign3_name, " ");
  }

  // Pipe
  writeCell(INTERNAL_ACTS_CELLS.pipe_mark, transition.pipe.mark);
  writeCell(INTERNAL_ACTS_CELLS.pipe_diameter, transition.pipe.diameter);

  // GNB params
  writeCell(INTERNAL_ACTS_CELLS.gnb_number_table, `№ ${transition.gnb_number_short}`);
  writeCell(INTERNAL_ACTS_CELLS.plan_length, transition.gnb_params.plan_length);
  writeCell(INTERNAL_ACTS_CELLS.profile_length, transition.gnb_params.profile_length);
  writeCell(INTERNAL_ACTS_CELLS.pipe_count, transition.gnb_params.pipe_count);
  writeCell(INTERNAL_ACTS_CELLS.drill_diameter, transition.gnb_params.drill_diameter);
  writeCell(INTERNAL_ACTS_CELLS.configuration, transition.gnb_params.configuration);

  // Additional fields needed by print sheets
  const designer = transition.organizations.designer;
  writeCell(INTERNAL_ACTS_CELLS.designer, designer?.short_name || designer?.name || "");
  const weldingEnd = transition.welding_end_date
    ? transition.welding_end_date
    : formatDateInternal(transition.end_date);
  writeCell(INTERNAL_ACTS_CELLS.welding_end_date, weldingEnd);
  writeCell(INTERNAL_ACTS_CELLS.customer_short, cust.short_name || cust.name || "");
  writeCell(INTERNAL_ACTS_CELLS.gnb_method, "ГНБ");
  writeCell(INTERNAL_ACTS_CELLS.act_date, formatDateInternal(actDate));
  writeCell(INTERNAL_ACTS_CELLS.profile_length_solo, transition.gnb_params.profile_length);

  // SRO — executor's certificate (find org matching transition.executor)
  const allOrgs = [cust, contr, designer].filter(Boolean);
  const executorOrg = allOrgs.find(o => o?.name === transition.executor || o?.short_name === transition.executor);
  writeCell(INTERNAL_ACTS_CELLS.sro_number, executorOrg?.sro_number ?? "");
  writeCell(INTERNAL_ACTS_CELLS.sro_date, executorOrg?.sro_date ?? "");

  // Warnings for missing optional fields
  if (!transition.gnb_params.plan_length) warnings.push("plan_length не указан");
  if (!transition.gnb_params.drill_diameter) warnings.push("drill_diameter не указан");

  // Write output
  fs.mkdirSync(outputDir, { recursive: true });
  const filePath = path.join(outputDir, `Акты ЗП ГНБ ${transition.gnb_number_short}.xlsx`);
  await wb.xlsx.writeFile(filePath);

  return { filePath, cellsFilled, warnings };
}
