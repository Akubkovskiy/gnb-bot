// === Domain types for GNB executive documentation ===
// RFC v1.1: domain-first architecture, ЗП 5-5 v2 = canonical format
// Gate decisions: no underscores in C-column, split B/C signatory format,
// welding_end_date deferred (optional)

// === Dates ===

export interface DateComponents {
  day: number;
  month: string; // родительный падеж: "октября"
  year: number;
}

// === Organization ===

export interface Organization {
  id: string; // "oek", "oek-stroytrest", "specinjstroy"
  name: string; // полное юр. название
  short_name?: string; // АО «ОЭК»
  department?: string; // СВРЭС (только для заказчика)
  ogrn: string;
  inn: string;
  legal_address: string;
  phone: string;
  sro_name: string;
  sro_ogrn?: string;
  sro_inn?: string;
  sro_number?: string; // СРО-С-NNN-DDMMYYYY
  sro_date?: string; // DD.MM.YYYY
}

// === Signatory ===

export type SignatoryRole = "sign1" | "sign2" | "sign3" | "tech";

export interface Signatory {
  person_id: string; // "gaydukov-ni"
  role: SignatoryRole;
  org_description: string; // B-column: "Представитель АО «ОЭК»"
  position: string; // "Главный специалист ОТН"
  full_name: string; // "Гайдуков Н.И."
  nrs_id?: string; // "C-71-259039" (sign2, tech)
  nrs_date?: string; // "23.09.2022"
  order_type?: string; // "распоряжение" | "приказ"
  order_number?: string; // "01/3349-р"
  order_date?: string; // "14.10.2024"
  aosr_full_line: string; // полная строка для АОСР
}

// === Pipe & Materials ===

export interface Pipe {
  mark: string; // "Труба ЭЛЕКТРОПАЙП 225/170-N 1250 F2 SDR 13,6"
  diameter: string; // "d=225"
  diameter_mm: number; // 225
  quality_passport?: string; // "№11086 от 08.09.2025"
  conformity_cert?: string; // "№РОСС RU..."
}

export interface Materials {
  ukpt?: { passport?: string; cert_letter?: string };
  plugs?: { cert_letter?: string };
  cord?: { cert_letter?: string };
}

// === GNB Parameters ===

export interface GnbParams {
  profile_length: number; // обязательно
  plan_length?: number;
  pipe_count: number; // обязательно, default 2
  drill_diameter?: number;
  configuration?: string;
}

// === Transition (core entity) ===

export type TransitionStatus = "draft" | "finalized";

export interface Transition {
  id: string; // "kraft-marjino-5-5"
  status: TransitionStatus;
  created_at: string; // ISO
  finalized_at?: string; // ISO

  // Identification
  customer: string; // "Крафт"
  object: string; // "Марьино"
  gnb_number: string; // "ЗП № 5-5"
  gnb_number_short: string; // "5-5"
  title_line: string;
  object_name: string;
  address: string;
  project_number: string;
  executor: string;

  // Dates
  start_date: DateComponents;
  end_date: DateComponents;
  act_date?: DateComponents; // null → end_date
  welding_end_date?: string; // deferred — optional

  // References (for navigation)
  refs: {
    person_ids: string[];
    org_ids: string[];
  };

  // Data snapshot (for generation/print)
  organizations: {
    customer: Organization;
    contractor: Organization;
    designer: Organization;
  };
  signatories: {
    sign1_customer: Signatory;
    sign2_contractor: Signatory;
    sign3_optional?: Signatory;
    tech_supervisor: Signatory;
  };
  pipe: Pipe;
  materials?: Materials;
  gnb_params: GnbParams;
  permits?: { sro_number?: string; sro_date?: string };
  regulatory?: {
    ministerial_order?: string;
    form_aosr1?: string;
    form_aosr2?: string;
  };

  // Traceability
  source_docs: string[];
  generated_files: string[];
  validation_report?: ValidationReport;

  // Revisions
  revisions: Revision[];
}

export interface Revision {
  version: string; // "изм 1", "изм 2"
  date: string; // ISO
  changes: string; // описание что изменилось
  diff: Record<string, { old: unknown; new: unknown }>;
  generated_files: string[];
}

// === Validation ===

export type ValidationLevel = "BLOCK" | "WARN" | "CONFIRM";

export interface ValidationIssue {
  level: ValidationLevel;
  field: string;
  message: string;
}

export interface ValidationReport {
  valid: boolean; // true if no BLOCK
  issues: ValidationIssue[];
  checked_at: string; // ISO
}

// === Draft ===

export interface Draft {
  id: string;
  step: number;
  chat_id: number;
  data: Partial<Transition>;
  created_at: string; // ISO
  updated_at: string; // ISO
  base_transition_id?: string; // "на основе ЗП X"
}

// === Person (for PeopleStore) ===

export interface Person {
  person_id: string;
  full_name: string;
  position: string;
  position_long?: string;
  organization: string;
  role: SignatoryRole;
  nrs_id?: string;
  nrs_date?: string;
  order_type?: string;
  order_number?: string;
  order_date?: string;
  aosr_full_line: string;
}

// === Customer (for CustomerStore) ===

export interface Customer {
  slug: string; // "kraft"
  name: string; // "Крафт"
  aliases: string[];
  objects: Record<string, ObjectEntry>;
}

export interface ObjectEntry {
  name: string; // "Марьино"
  path: string; // "Крафт/Марьино"
  last_gnb?: string; // "ЗП № 5-5"
}
