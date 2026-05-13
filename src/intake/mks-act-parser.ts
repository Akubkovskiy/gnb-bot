/**
 * MKS act parser — reads Лист1 from an МКС АОСР+РЭР xlsx/xls file
 * and extracts all structured data.
 *
 * Detection: presence of "Лист1" sheet + characteristic cells (A14, B35, C47..C69).
 */
import XLSX from "xlsx";

// ---------------------------------------------------------------------------
// Parsed types
// ---------------------------------------------------------------------------

export interface ParsedPerson {
  /** A14/A17/A20/A23/A26/A31 — full "position name" line */
  line1: string;
  /** A15/A18/A21/A24/A27/A32 — "inrs  order" line (may be empty) */
  line2: string;
  /** B35/B37/B39/B41/B43/B45 — short name (surname + initials) */
  short_name: string;

  // --- Parsed parts (best-effort extraction from line1 / line2) ---
  /** Extracted name (initials form, e.g. "Гусев П.А.") */
  name?: string;
  /** Position part of line1 (everything before the name) */
  position?: string;
  /** ИНРС/НРС credential string from line2 */
  inrs?: string;
  /** Приказ/распоряжение string from line2 */
  order?: string;
}

export interface ParsedMksAct {
  // === Identification ===
  object_title: string;
  address: string;
  project_code: string;
  transition_number: string;
  rer_department: string;

  // === Dates (as Excel serial numbers — convert to Date via serialToDate) ===
  date_start_serial?: number;
  date_end_serial?: number;

  // === Organizations ===
  contractor_org_name: string;
  contractor_org_details: string;
  designer_org_name: string;
  designer_org_details: string;
  executor_org_name: string;
  executor_org_details: string;

  // === Signatories ===
  mks_rep: ParsedPerson;
  contractor1: ParsedPerson;
  contractor2: ParsedPerson;
  designer_rep: ParsedPerson;
  executor_rep: ParsedPerson;
  rer_rep: ParsedPerson;

  // === Technical ===
  length_m?: number;
  pipe_count?: number;
  pipe_diameter_mm?: number;
  pipe_mark?: string;
  pipe_docs?: string;
  bentonite_qty_l?: number;
  polymer_qty_l?: number;
  final_expansion_mm?: number;
  bentonite_info?: string;
  polymer_info?: string;
  plugs_info?: string;
  designer_short?: string;
  contractor_short?: string;
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/**
 * Returns true if the file looks like an МКС АОСР+РЭР book.
 * Criterion: has "Лист1" sheet + C47 or B35 non-empty.
 */
export function isMksActFile(filePath: string): boolean {
  try {
    const wb = XLSX.readFile(filePath, { sheetRows: 50 });
    if (!wb.SheetNames.includes("Лист1")) return false;
    const s1 = wb.Sheets["Лист1"];
    // Characteristic cells: B35 (mks_rep short_name) and C47 (rer_department)
    const b35 = s1["B35"];
    const c47 = s1["C47"];
    return !!(b35?.v || c47?.v);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

export function parseMksAct(filePath: string): ParsedMksAct {
  const wb = XLSX.readFile(filePath, { cellStyles: false, cellFormula: true });
  const s1 = wb.Sheets["Лист1"];
  if (!s1) throw new Error("Лист1 не найден в файле");

  const g = (addr: string): string => {
    const cell = s1[addr] as XLSX.CellObject | undefined;
    if (!cell) return "";
    return String(cell.v ?? "").trim();
  };

  const gn = (addr: string): number | undefined => {
    const cell = s1[addr] as XLSX.CellObject | undefined;
    if (!cell || cell.v === undefined) return undefined;
    const n = Number(cell.v);
    return isNaN(n) ? undefined : n;
  };

  const buildPerson = (
    line1Addr: string,
    line2Addr: string,
    shortAddr: string,
  ): ParsedPerson => {
    const line1 = g(line1Addr);
    const line2 = g(line2Addr);
    const short_name = g(shortAddr);

    const { position, name } = splitLine1(line1, short_name);
    const { inrs, order } = splitLine2(line2);

    return { line1, line2, short_name, position, name, inrs, order };
  };

  return {
    object_title: g("A2"),
    address: g("C48"),
    project_code: g("C68"),
    transition_number: g("C49"),
    rer_department: g("C47"),

    date_start_serial: gn("C50"),
    date_end_serial: gn("C51"),

    contractor_org_name: g("A7"),
    contractor_org_details: g("A8"),
    designer_org_name: g("A10"),
    designer_org_details: g("A11"),
    executor_org_name: g("A28"),
    executor_org_details: g("A29"),

    mks_rep:      buildPerson("A14", "A15", "B35"),
    contractor1:  buildPerson("A17", "A18", "B37"),
    contractor2:  buildPerson("A20", "A21", "B39"),
    designer_rep: buildPerson("A23", "A24", "B41"),
    executor_rep: buildPerson("A26", "A27", "B43"),
    rer_rep:      buildPerson("A31", "A32", "B45"),

    length_m:           gn("C53"),
    pipe_count:         gn("C54"),
    pipe_diameter_mm:   gn("C55"),
    pipe_mark:          g("C61"),
    pipe_docs:          g("C62"),
    bentonite_qty_l:    gn("C58"),
    polymer_qty_l:      gn("C59"),
    final_expansion_mm: gn("C60"),
    bentonite_info:     g("C63"),
    polymer_info:       g("C64"),
    plugs_info:         g("C65"),
    designer_short:     g("C67"),
    contractor_short:   g("C69"),
  };
}

/** Convert Excel serial date to JS Date. */
export function serialToDate(serial: number): Date {
  return new Date((serial - 25569) * 86400000);
}

// ---------------------------------------------------------------------------
// Line parsing helpers
// ---------------------------------------------------------------------------

/**
 * Split "position name" line1 into position + name.
 * Strategy:
 *   1. If short_name is non-empty, find it in line1 and split there.
 *   2. Else look for "Surname И.О." pattern (capital + 2 initials with dots).
 */
function splitLine1(
  line1: string,
  short_name: string,
): { position: string; name: string } {
  if (!line1) return { position: "", name: short_name || "" };

  // Strategy 1: exact short_name match
  if (short_name) {
    const idx = line1.lastIndexOf(short_name);
    if (idx >= 0) {
      return {
        position: line1.slice(0, idx).trim(),
        name: short_name,
      };
    }
    // Try trimmed variant (template sometimes has trailing comma/space)
    const stripped = short_name.replace(/[,\s]+$/, "");
    const idx2 = line1.lastIndexOf(stripped);
    if (idx2 >= 0) {
      return {
        position: line1.slice(0, idx2).trim(),
        name: line1.slice(idx2).trim(),
      };
    }
  }

  // Strategy 2: "Фамилия И.О." pattern at end of string
  const m = line1.match(/^(.+?)\s+([А-ЯЁ][а-яё]+\s+[А-ЯЁ]\.[А-ЯЁ]\.[,\s]*)$/);
  if (m) {
    return { position: m[1].trim(), name: m[2].trim().replace(/,$/, "") };
  }

  return { position: line1, name: short_name || "" };
}

/**
 * Split "inrs  order" line2.
 * Heuristic:
 *   - ИНРС part: starts with "ИНРС", "НРС", "С-77-", "С-71-", "ПИ-", "индет"
 *   - Order part: starts with "приказ", "распоряжение", "Приказ", "Распоряжение"
 *
 * Both are optional. Double-space is the separator in our format, but
 * real templates use semicolons, commas, single spaces — we're permissive.
 */
function splitLine2(line2: string): { inrs?: string; order?: string } {
  if (!line2) return {};

  // Split on double-space or semicolons
  const parts = line2.split(/;\s*|  +/).map((p) => p.trim()).filter(Boolean);

  let inrs: string | undefined;
  let order: string | undefined;

  for (const part of parts) {
    if (/^(ИНРС|НРС|инрс|С-\d{2}-|ПИ-|инден|индет)/i.test(part)) {
      inrs = part;
    } else if (/^(приказ|распоряжение)/i.test(part)) {
      order = part;
    } else if (!inrs && /\d{2}\.\d{2}\.\d{4}/.test(part)) {
      // Contains a date — likely ИНРС number
      inrs = part;
    } else if (!order) {
      order = part;
    }
  }

  return { inrs, order };
}
