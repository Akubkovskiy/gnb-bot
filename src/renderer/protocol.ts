/**
 * GNB drilling protocol renderer — fills «Протокол ГНБ шаблон.xlsx».
 * Uses SheetJS (xlsx) with cellStyles:true to preserve template formatting.
 *
 * Original template cell layout (sheet «10-1С»):
 *   A2          — title: «Протокол бурения ГНБ {number}»
 *   A4          — date (blank template field, written only if date provided)
 *   A6          — object title
 *   A8          — work type: «Вид работ: Переход  методом ГНБ »
 *   A10         — pipe description
 *   I10         — total bore length (number)
 *   A12         — «Выполненные работы:»
 *   A13…A1x     — work steps (one per row)
 *   A17         — drilling rig
 *   A19         — locating system
 *   A21         — probe type
 *   A23         — start date
 *   A25         — end date
 *   A27–D27     — table header (preserved from template)
 *   A28… D28+   — data rows: №(n), len(s), slope(n), depth(s or blank)
 *   A61         — rod length note
 *   A64         — «Руководитель отдела ГНБ»
 *   E64         — foreman name
 */

import XLSX from "xlsx";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ProtocolInput, ProtocolPoint } from "../domain/protocol-types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = path.join(__dirname, "../../templates", "Протокол ГНБ шаблон.xlsx");

const DATA_START_ROW = 27; // row 28 in Excel (0-based index)

export interface ProtocolRenderResult {
  filePath: string;
  pointCount: number;
}

// ---------------------------------------------------------------------------
// Cell helpers — spread existing to preserve style index
// ---------------------------------------------------------------------------

function fmt(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}

/** Write string cell, preserving existing style */
function ws_s(ws: XLSX.WorkSheet, addr: string, value: string) {
  const existing = ws[addr] as XLSX.CellObject | undefined;
  ws[addr] = { ...(existing ?? {}), v: value, t: "s" };
}

/** Write number cell, preserving existing style */
function ws_n(ws: XLSX.WorkSheet, addr: string, value: number) {
  const existing = ws[addr] as XLSX.CellObject | undefined;
  ws[addr] = { ...(existing ?? {}), v: value, t: "n" };
}

/** Write string only if value is provided (skip if undefined) */
function ws_s_opt(ws: XLSX.WorkSheet, addr: string, value: string | undefined) {
  if (value !== undefined) ws_s(ws, addr, value);
}

// ---------------------------------------------------------------------------
// Main renderer
// ---------------------------------------------------------------------------

export async function renderProtocol(
  input: ProtocolInput,
  outputDir: string,
): Promise<ProtocolRenderResult> {
  const wb = XLSX.readFile(TEMPLATE_PATH, { cellStyles: true });
  const sheetName = wb.SheetNames[0]; // «10-1С»
  const ws = wb.Sheets[sheetName];

  if (!ws) throw new Error(`Лист «${sheetName}» не найден в шаблоне протокола`);

  // --- Row 2: title ---
  // Original format: "Протокол бурения ГНБ 16" (no «№» prefix, just the number)
  const num = input.transition_number.replace(/^№\s*/, "");
  ws_s(ws, "A2", `Протокол бурения ГНБ ${num}`);

  // --- Row 4: date (A4) — write only if date provided ---
  if (input.date) {
    ws_s(ws, "A4", fmt(input.date));
  }

  // --- Row 6: object ---
  ws_s(ws, "A6", `Объект: ${input.object_title}`);

  // --- Row 8: work type (match original spacing exactly) ---
  ws_s(ws, "A8", "Вид работ: Переход  методом ГНБ ");

  // --- Row 10: pipe info + total length ---
  ws_s_opt(ws, "A10", input.pipe_info);
  if (input.total_length_m !== undefined) {
    ws_n(ws, "I10", input.total_length_m);
  }

  // --- Rows 12-15: work steps ---
  if (input.work_steps && input.work_steps.length > 0) {
    ws_s(ws, "A12", "Выполненные работы:");
    for (let i = 0; i < input.work_steps.length; i++) {
      ws_s(ws, `A${13 + i}`, input.work_steps[i]);
    }
  }

  // --- Row 17: rig type ---
  if (input.rig_type) {
    ws_s(ws, "A17", `Установка ГНБ: ${input.rig_type}`);
  }

  // --- Row 19: locating system ---
  if (input.locating_system) {
    ws_s(ws, "A19", `Тип локационной системы: ${input.locating_system}`);
  }

  // --- Row 21: probe type ---
  if (input.probe_type) {
    ws_s(ws, "A21", `Тип зонда: ${input.probe_type}`);
  }

  // --- Row 23: start date ---
  if (input.date_start) {
    ws_s(ws, "A23", `Начало работ: ${fmt(input.date_start)} г.`);
  } else if (input.date) {
    ws_s(ws, "A23", `Начало работ: ${fmt(input.date)} г.`);
  }

  // --- Row 25: end date ---
  if (input.date_end) {
    ws_s(ws, "A25", `Окончание работ: ${fmt(input.date_end)} г.`);
  } else if (input.date) {
    ws_s(ws, "A25", `Окончание работ: ${fmt(input.date)} г.`);
  }

  // --- Data rows (28+) ---
  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1:J64");

  for (let i = 0; i < input.points.length; i++) {
    const pt: ProtocolPoint = input.points[i];
    const row = DATA_START_ROW + i;

    // Column A: section number (number, matches original t:'n')
    ws_n(ws, XLSX.utils.encode_cell({ r: row, c: 0 }), pt.n);

    // Column B: section_length_m — write as STRING "7.40" to match original (t:'s')
    const lenStr = pt.section_length_m.toFixed(2);
    ws_s(ws, XLSX.utils.encode_cell({ r: row, c: 1 }), lenStr);

    // Column C: slope — write as number (matches original t:'n')
    ws_n(ws, XLSX.utils.encode_cell({ r: row, c: 2 }), pt.slope);

    // Column D: depth_cm — write if provided, otherwise leave blank
    if (pt.depth_cm !== undefined) {
      // Match original format: string with 1 decimal
      ws_s(ws, XLSX.utils.encode_cell({ r: row, c: 3 }), pt.depth_cm.toFixed(1));
    }

    if (row > range.e.r) range.e.r = row;
  }

  ws["!ref"] = XLSX.utils.encode_range(range);

  // --- Row 61: rod length note ---
  if (input.rod_length_cm !== undefined) {
    ws_s(ws, "A61", `Длина каждой штанги - ${input.rod_length_cm} сантиметров`);
  }

  // --- Row 64: foreman ---
  if (input.foreman_name) {
    ws_s(ws, "A64", "Руководитель отдела ГНБ");
    ws_s(ws, "E64", input.foreman_name);
  }

  // --- Write output ---
  fs.mkdirSync(outputDir, { recursive: true });
  const transNum = input.transition_number.replace(/[№#\s]/g, "");
  const filePath = path.join(outputDir, `Протокол ГНБ ЗП ${transNum}.xlsx`);
  XLSX.writeFile(wb, filePath, { bookType: "xlsx", cellStyles: true });

  return { filePath, pointCount: input.points.length };
}
