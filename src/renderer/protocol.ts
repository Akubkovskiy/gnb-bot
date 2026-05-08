/**
 * GNB drilling protocol renderer — fills «Протокол ГНБ шаблон.xlsx».
 * Uses SheetJS (xlsx) with cellStyles:true to preserve template formatting.
 *
 * Template structure (sheet «10-1С»):
 *   Row 1      — empty
 *   Row 2      — protocol title: «Протокол бурения ГНБ №…»
 *   Row 3-4    — date
 *   Row 5-6    — object
 *   Rows 7-26  — work description, equipment, etc.
 *   Row 27     — table header: №, длина_м, уклон, глубина_см
 *   Rows 28+   — data (one row per bore section)
 *   Rows after — signatures
 */

import XLSX from "xlsx";
import fs from "node:fs";
import path from "node:path";
import type { ProtocolInput, ProtocolPoint } from "../domain/protocol-types.js";

const TEMPLATE_PATH = path.join(process.cwd(), "templates", "Протокол ГНБ шаблон.xlsx");

// Row indices (0-based) where data sections start
const DATA_START_ROW = 27; // row 28 in Excel

export interface ProtocolRenderResult {
  filePath: string;
  pointCount: number;
}

// ---------------------------------------------------------------------------
// Cell helpers — always spread existing to preserve style index
// ---------------------------------------------------------------------------

function fmt(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}

function ws_s(ws: XLSX.WorkSheet, addr: string, value: string) {
  const existing = ws[addr] as XLSX.CellObject | undefined;
  ws[addr] = { ...(existing ?? {}), v: value, t: "s" };
}

function ws_n(ws: XLSX.WorkSheet, addr: string, value: number) {
  const existing = ws[addr] as XLSX.CellObject | undefined;
  ws[addr] = { ...(existing ?? {}), v: value, t: "n" };
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

  // --- Header ---
  ws_s(ws, "A2",  `Протокол бурения ГНБ ${input.transition_number}`);
  ws_s(ws, "A4",  fmt(input.date));
  ws_s(ws, "A6",  `Объект: ${input.object_title}`);
  ws_s(ws, "A8",  "Вид работ: Переход методом ГНБ");
  ws_s(ws, "A23", `Начало работ: ${fmt(input.date_start ?? input.date)} г.`);
  ws_s(ws, "A25", `Окончание работ: ${fmt(input.date_end ?? input.date)} г.`);

  // --- Data rows ---
  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1:J64");

  for (let i = 0; i < input.points.length; i++) {
    const pt: ProtocolPoint = input.points[i];
    const row = DATA_START_ROW + i;

    ws_n(ws, XLSX.utils.encode_cell({ r: row, c: 0 }), pt.n);
    ws_n(ws, XLSX.utils.encode_cell({ r: row, c: 1 }), pt.section_length_m);
    ws_n(ws, XLSX.utils.encode_cell({ r: row, c: 2 }), pt.slope);
    // Column D (depth_cm): only write if provided; otherwise leave blank
    if (pt.depth_cm !== undefined) {
      ws_n(ws, XLSX.utils.encode_cell({ r: row, c: 3 }), pt.depth_cm);
    }

    // Expand range if needed
    if (row > range.e.r) range.e.r = row;
  }

  ws["!ref"] = XLSX.utils.encode_range(range);

  // --- Write output ---
  fs.mkdirSync(outputDir, { recursive: true });
  const transNum = input.transition_number.replace(/[№#\s]/g, "");
  const filePath = path.join(outputDir, `Протокол ГНБ ЗП ${transNum}.xlsx`);
  XLSX.writeFile(wb, filePath, { bookType: "xlsx", cellStyles: true });

  return { filePath, pointCount: input.points.length };
}
