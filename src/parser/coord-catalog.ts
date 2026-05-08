/**
 * Coordinate catalog parser — XYH or chainage (pk) profile.
 *
 * Supported input formats:
 *   - Excel (.xlsx): columns [№, X, Y, H] or [№, pk, H]
 *   - CSV / TSV: same column layout
 *   - Plain text: lines matching "N  X  Y  H" or "N  pk  H"
 */

import XLSX from "xlsx";
import fs from "node:fs";
import type { RawPoint } from "../domain/protocol-types.js";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function validatePoints(raw: unknown[]): RawPoint[] {
  if (!Array.isArray(raw) || raw.length < 2) {
    throw new Error(
      `Слишком мало точек: ${raw?.length ?? 0}. Нужно минимум 2 (для 1 участка).`
    );
  }

  const first = raw[0] as Record<string, unknown>;
  const hasH = raw.every((p) => typeof (p as Record<string, unknown>).h === "number");
  if (!hasH) {
    throw new Error("Не найдены H-координаты (высотные отметки) во всех точках.");
  }

  const hasXY = "x" in first && "y" in first;
  const hasPk = "pk" in first;
  if (!hasXY && !hasPk) {
    throw new Error(
      "Нет ни X/Y-координат, ни пикетажа (pk). Невозможно вычислить длины участков."
    );
  }

  return raw as RawPoint[];
}

// ---------------------------------------------------------------------------
// Excel parser
// ---------------------------------------------------------------------------

/**
 * Try to find column indices for the expected fields.
 * Looks for case-insensitive partial matches in the header row.
 */
function detectColumns(header: unknown[]): {
  n: number; x?: number; y?: number; pk?: number; h: number;
} {
  const find = (keywords: string[]): number | undefined => {
    for (let i = 0; i < header.length; i++) {
      const cell = String(header[i] ?? "").toLowerCase();
      if (keywords.some((k) => cell.includes(k))) return i;
    }
    return undefined;
  };

  const n  = find(["№", "n", "num", "point", "точк"]) ?? 0;
  const h  = find(["h", "hн", "отм", "высот", "alt", "elev"]);
  const x  = find(["x", "север", "north", "n_coord"]);
  const y  = find(["y", "восток", "east", "e_coord"]);
  const pk = find(["pk", "пк", "station", "station"]);

  if (h === undefined) throw new Error("Не найдена колонка H (высота/отметка) в заголовке каталога.");

  return { n, x, y, pk, h };
}

export function parseExcelCatalog(filePath: string): RawPoint[] {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

  if (rows.length < 2) throw new Error("Файл каталога пустой или содержит только заголовок.");

  // Find header row (first row with text cells)
  let headerIdx = 0;
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const row = rows[i] as unknown[];
    if (row.some((c) => typeof c === "string" && c.trim().length > 0)) {
      headerIdx = i;
      break;
    }
  }

  const header = rows[headerIdx] as unknown[];
  const cols = detectColumns(header);
  const points: RawPoint[] = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    const rawN = row[cols.n];
    const n = typeof rawN === "number" ? rawN : parseInt(String(rawN), 10);
    if (!n || isNaN(n)) continue; // skip empty rows

    const h = parseFloat(String(row[cols.h]));
    if (isNaN(h)) continue;

    if (cols.x !== undefined && cols.y !== undefined) {
      const x = parseFloat(String(row[cols.x]));
      const y = parseFloat(String(row[cols.y]));
      if (!isNaN(x) && !isNaN(y)) {
        points.push({ n, x, y, h });
        continue;
      }
    }
    if (cols.pk !== undefined) {
      const pk = parseFloat(String(row[cols.pk]));
      if (!isNaN(pk)) {
        points.push({ n, pk, h });
        continue;
      }
    }
  }

  return validatePoints(points);
}

// ---------------------------------------------------------------------------
// Plain text parser
// ---------------------------------------------------------------------------

/**
 * Parse whitespace-separated text with lines like:
 *   1   12195.05   13606.40   146.24
 *   1   0.00   146.24   (chainage: n, pk, h)
 */
export function parseTextCatalog(text: string): RawPoint[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const points: RawPoint[] = [];

  for (const line of lines) {
    // Skip obvious header lines
    if (/^[а-яёa-z№#]/i.test(line) && !/^\d/.test(line)) continue;

    const nums = line.split(/[\s,;]+/).map(Number).filter((n) => !isNaN(n));
    if (nums.length === 4) {
      // N, X, Y, H
      const [n, x, y, h] = nums;
      points.push({ n, x, y, h });
    } else if (nums.length === 3) {
      // N, pk, H
      const [n, pk, h] = nums;
      points.push({ n, pk, h });
    }
  }

  return validatePoints(points);
}

// ---------------------------------------------------------------------------
// Unified entry point
// ---------------------------------------------------------------------------

export async function parseCatalog(filePath: string): Promise<RawPoint[]> {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";

  if (["xlsx", "xls", "csv"].includes(ext)) {
    if (ext === "csv") {
      // Treat CSV as plain text
      const text = fs.readFileSync(filePath, "utf-8");
      return parseTextCatalog(text);
    }
    return parseExcelCatalog(filePath);
  }

  // Try plain text for unknown extensions
  const text = fs.readFileSync(filePath, "utf-8");
  return parseTextCatalog(text);
}
