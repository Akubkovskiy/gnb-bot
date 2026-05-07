// МКС (Московские кабельные сети) — domain types for АОСР+РЭР package

export interface MksPerson {
  /** Full signatory line for act body (position + ФИО + ИНРС/НРС + order) */
  full_line: string;
  /** Short name for signature row (Фамилия И.О.) */
  short_name: string;
}

export interface MksActDates {
  /** Дата разбивки (act 1) */
  survey: Date;
  /** Дата котлованов (acts 2, 9) */
  pits: Date;
  /** Дата пилотной скважины (act 3) */
  pilot: Date;
  /** Дата расширения (act 4) */
  expansion: Date;
  /** Дата протягивания (act 5) */
  pullback: Date;
  /** Дата финальных актов (соосность, проходимость, герметизация, устройство) */
  final: Date;
}

export interface MksActsInput {
  // === Project identification ===
  /** «Строительство 8КЛ-0,4 кВ от ТП-10/0,4кВ…» */
  object_title: string;
  /** г. Москва, Салтыковская ул. д.5А */
  address: string;
  /** 345716/ПС-25 */
  project_code: string;
  /** №1 */
  transition_number: string;
  /** 7 РЭР УКС ЮВО МКС филиал ПАО «РОССЕТИ МОСКОВСКИЙ РЕГИОН» */
  rer_department: string;

  // === Dates ===
  dates: MksActDates;

  // === Organizations ===
  /** Full legal line: "ООО «СМК» ОГРН ... ИНН ... адрес ..." */
  contractor_org_line: string;
  designer_org_line: string;
  executor_org_name: string;
  executor_org_line: string;
  /** Short name for Лист1 */
  contractor_short: string;
  designer_short: string;

  // === Signatories (6 roles) ===
  mks_rep: MksPerson;
  contractor1: MksPerson;
  contractor2: MksPerson;
  designer_rep: MksPerson;
  executor_rep: MksPerson;
  rer_rep: MksPerson;

  // === Technical parameters ===
  length_m: number;
  pipe_count: number;
  pipe_diameter_mm: number;
  pipe_mark: string;
  pipe_docs: string;
  bentonite_qty_l: number;
  bentonite_info: string;
  polymer_qty_l: number;
  polymer_info: string;
  final_expansion_mm: number;
  plugs_info: string;
}
