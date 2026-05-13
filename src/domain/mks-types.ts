// МКС (Московские кабельные сети) — domain types for АОСР+РЭР package

/**
 * MKS signatory — 4 independently editable fields that map to the Excel template.
 *
 * Template layout:
 *   A14 (first A-row)  = "${position} ${name}"
 *   A15 (second A-row) = "${inrs}  ${order}"  (joined with 2 spaces; omitted if both empty)
 *   B35/B37/…          = short_name  (signature row)
 *
 * DB source:
 *   position  ← people.position_long
 *   name      ← people.full_name
 *   inrs      ← "ИНРС в области строительства №{nrs_id} от {nrs_date}"
 *   order     ← person_documents WHERE doc_type IN ('приказ','распоряжение') AND is_current=1
 *   short_name ← people.surname + initials
 */
export interface MksPerson {
  /** Должность — full position string.
   *  Example: "Заместитель начальника УКС ЮВО МКС филиал ПАО «РОССЕТИ МОСКОВСКИЙ РЕГИОН»" */
  position: string;
  /** ФИО (short initials form).
   *  Example: "Гусев П.А." */
  name: string;
  /** ИНРС/НРС formatted credential string.
   *  Example: "ИНРС в области строительства №С-77-204102 от 18.10.2019"
   *  Optional — omit if no credential required. */
  inrs?: string;
  /** Приказ/распоряжение о полномочиях.
   *  Example: "распоряжение №1399р от 01.07.2025 г."
   *  Optional. */
  order?: string;
  /** Short name for signature row. Usually same as `name`.
   *  Maps to Лист1 B35/B37/B39/B41/B43/B45. */
  short_name: string;
}

/**
 * Dates for the АОСР package.
 * Only start + end are needed — all intermediate act dates are derived
 * automatically by Лист1 formulas (pilot = start+1, pullback = end-1, etc.).
 */
export interface MksActsDates {
  /** Дата начала работ → Лист1!C50. Used for разбивка and котлованы acts. */
  start: Date;
  /** Дата окончания работ → Лист1!C51. Used for финальные акты. */
  end: Date;
}

export interface MksActsInput {
  // === Project identification ===
  /** «Строительство 8КЛ-0,4 кВ от ТП-10/0,4кВ…» → Лист1!A2 */
  object_title: string;
  /** г. Москва, Салтыковская ул. д.5А → Лист1!C48 */
  address: string;
  /** 345716/ПС-25 → Лист1!C68 */
  project_code: string;
  /** №1 → Лист1!C49 and C71 */
  transition_number: string;
  /** 7 РЭР УКС ЮВО МКС филиал ПАО «РОССЕТИ МОСКОВСКИЙ РЕГИОН» → Лист1!C47 */
  rer_department: string;

  // === Dates ===
  dates: MksActsDates;

  // === Organizations (split into name + details to match Лист1 two-row structure) ===

  /**
   * Подрядчик-строитель: short name line → Лист1!A7.
   * Example: "ООО «СМК» "
   */
  contractor_org_name: string;
  /**
   * Подрядчик-строитель: details → Лист1!A8.
   * Example: "ОГРН 1167154074570, ИНН 7130031154, 153510, Ивановская область..."
   */
  contractor_org_details: string;

  /**
   * Проектировщик: short name → Лист1!A10.
   * Example: "ООО «СМК» "
   */
  designer_org_name: string;
  /**
   * Проектировщик: details → Лист1!A11.
   */
  designer_org_details: string;

  /**
   * Исполнитель (выполнил работы): org name → Лист1!A28.
   * Example: "ООО «СКМ-ГРУПП»"
   */
  executor_org_name: string;
  /**
   * Исполнитель: org details → Лист1!A29.
   */
  executor_org_details: string;

  /** Short org name for Лист1!C69 (e.g. " ООО «СКМ-ГРУПП»") */
  contractor_short: string;
  /** Short org name for Лист1!C67 (e.g. "ООО «СМК» ") */
  designer_short: string;

  // === Signatories (6 roles) ===
  /** Представитель МКС → Лист1!A14+A15, B35 */
  mks_rep: MksPerson;
  /** Подрядчик-1 (строительный контроль) → Лист1!A17+A18, B37 */
  contractor1: MksPerson;
  /** Подрядчик-2 (выполнял работы) → Лист1!A20+A21, B39 */
  contractor2: MksPerson;
  /** Проектировщик → Лист1!A23+A24, B41 */
  designer_rep: MksPerson;
  /** Представитель исполнителя → Лист1!A26+A27 (+A28+A29 = org), B43 */
  executor_rep: MksPerson;
  /** Представитель РЭР → Лист1!A31+A32, B45 */
  rer_rep: MksPerson;

  // === Technical parameters ===
  /** Длина ГНБ (м) → Лист1!C53 */
  length_m: number;
  /** Количество труб → Лист1!C54 */
  pipe_count: number;
  /** Диаметр трубоканалов (мм) → Лист1!C55 */
  pipe_diameter_mm: number;
  /** Марка трубы → Лист1!C61 */
  pipe_mark: string;
  /** Паспорт качества + сертификат → Лист1!C62 */
  pipe_docs: string;
  /** Бентонит (л) → Лист1!C58 */
  bentonite_qty_l: number;
  /** Бентонит (марка + сертификат) → Лист1!C63 */
  bentonite_info: string;
  /** Полимер (л) → Лист1!C59 */
  polymer_qty_l: number;
  /** Полимер (марка) → Лист1!C64 */
  polymer_info: string;
  /** Финальное расширение (мм) → Лист1!C60 */
  final_expansion_mm: number;
  /** Заглушки → Лист1!C65 */
  plugs_info: string;
}
