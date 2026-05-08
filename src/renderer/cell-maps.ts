/**
 * Cell map constants for all Excel templates.
 * Source of truth: CELL_MAP.md + UNIFIED_SCHEMA.md
 *
 * Phase 0 Finding #1: Template v2 is NOT clean (contains residual data).
 * Renderer MUST write to ALL data cells — write " " for empty values.
 */

// === Internal Acts — Лист1 (26 data cells + 1 auto) ===

/** Maps transition field names to Лист1 cell addresses. */
export const INTERNAL_ACTS_CELLS = {
  // Identification (rows 2-11)
  // B3 empty (row kept for spacing)
  title_line: "B4",
  address: "B5",
  gnb_number: "B6",
  project_number: "B7",
  start_date: "B8",
  end_date: "B9",
  executor: "B10",
  completion_date: "B11",

  // Organizations (rows 13-16)
  customer_display: "B14",
  contractor_display: "B15",
  contractor_label: "A15",
  sub_display: "B16",
  sub_label: "A16",

  // Signatories — B column (org description: "Представитель [org]")
  sign1_desc: "B20",
  sign2_desc: "B21",
  sign3_desc: "B22",

  // Signatories — C column (position)
  sign1_position: "C20",
  sign2_position: "C21",
  sign3_position: "C22",

  // Signatories — D column (full_name)
  sign1_name: "D20",
  sign2_name: "D21",
  sign3_name: "D22",

  // Additional fields needed by print sheets (rows 17, 23, 35-37)
  designer: "B17",            // проектировщик org name
  welding_end_date: "B23",    // дата окончания сварки
  customer_short: "E14",      // заказчик short (отдельно от B14)
  gnb_method: "B35",          // метод ("ГНБ")
  act_date: "B36",            // дата акта (отдельно от completion_date)
  profile_length_solo: "B37", // profile length as standalone number (for CONCATENATE formulas)

  // SRO — executor's self-regulatory org certificate (rows 33-34)
  sro_number: "B33",
  sro_date: "B34",

  // Pipe (rows 25-27)
  pipe_mark: "B26",
  pipe_diameter: "B27",

  // GNB params (row 31)
  gnb_number_table: "A31",
  plan_length: "B31",
  profile_length: "C31",
  pipe_count: "D31",
  // E31 = formula =C31*D31 (auto)
  drill_diameter: "F31",
  configuration: "G31",
  // H31 = formula =E31/13 (auto)
} as const;

/** All cells that must be written to (even if empty → " "). */
export const INTERNAL_ACTS_ALL_CELLS = Object.values(INTERNAL_ACTS_CELLS);

// === АОСР — Лист1 (10 data cells, B4 is formula) ===

export const AOSR_SHEET1_CELLS = {
  gnb_number_short: "B2",
  profile_length: "B3",
  pipe_count: "C3",
  // B4 = formula =C3*B3 (auto)
  address: "B5",
  start_day: "C6",
  start_month: "D6",
  start_year: "E6",
  end_day: "C7",
  end_month: "D7",
  end_year: "E7",
  act_day: "C8",
  act_month: "D8",
  act_year: "E8",
} as const;

// === АОСР(1) — Hardcoded cells (16 cells) ===

export const AOSR1_CELLS = {
  object_title: "A4",
  org_customer: "A7",
  org_contractor: "A10",
  org_designer: "A13",
  tech_full: "A22",
  sign1_full: "A24",
  sign2_full: "A27",
  sign2_control: "A30", // строительный контроль = same as sign2
  sign3_full: "A36",
  project_doc: "A45",
  tech_name: "A70",
  sign1_name: "A73",
  sign2_name: "A76",
  sign2_control_name: "A80", // строительный контроль name
  designer_name: "A83", // представитель проектной организации
  sign3_name: "A86",
} as const;

// === АОСР(2) — Hardcoded cells (9 cells) ===
// Note: АОСР(2) pulls most org/signatory data from АОСР(1) via formulas.
// These are the cells that must be filled directly.

export const AOSR2_CELLS = {
  sign3_full: "A36",
  sign3_org_name: "A39",
  materials: "A49",
  subsequent_works: "A59",
  tech_name: "A69",
  sign1_name: "A72",
  sign2_name: "A75",
  sign2_control_name: "A79",
  designer_name: "A82", // представитель проектной организации
  sign3_name: "A85",
} as const;

// === Sheet names ===

export const SHEET_NAMES = {
  internalActs: "Лист1",
  aosrSheet1: "Лист1",
  aosr1: "АОСР (1)",
  aosr2: "АОСР (2)",
} as const;
