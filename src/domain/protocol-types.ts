/**
 * Types for GNB drilling protocol generator.
 *
 * A protocol lists each bore section with its length, slope (ratio), and
 * the depth of the drilling head (a field measurement left blank by the
 * renderer — filled manually from the bore journal).
 */

/** A survey point from a coordinate catalog. */
export type RawPoint =
  | { n: number; x: number; y: number; h: number }   // XYH catalog
  | { n: number; pk: number; h: number };             // chainage profile

/** One calculated bore section (between consecutive survey points). */
export interface ProtocolPoint {
  /** Section number (1-based). */
  n: number;
  /** Horizontal length of pilot bore, m. */
  section_length_m: number;
  /**
   * Inclination of drilling head (ratio, not percent).
   * Positive = going down, negative = going up.
   * Matches the «Угол наклона буровой головки, %» column in the template,
   * which actually stores the ratio (0.32 = 32cm/100m).
   */
  slope: number;
  /**
   * Depth of drilling head, cm.
   * This is a field measurement from the locator/inclinometer probe —
   * NOT computable from the coordinate catalog.
   * Left undefined → renderer leaves the cell blank for manual entry.
   */
  depth_cm?: number;
}

/** Full input for the protocol renderer. */
export interface ProtocolInput {
  /** Project/object title (fills A6). */
  object_title: string;
  /**
   * Transition/bore number.
   * Used in title row as-is: "Протокол бурения ГНБ {transition_number}".
   * Pass just the number (e.g. "16") or with prefix ("№1-1") as needed.
   */
  transition_number: string;
  /** Protocol date (shown in A4 if provided). */
  date?: Date;
  /** Work start date (A23). */
  date_start?: Date;
  /** Work end date (A25). */
  date_end?: Date;
  /** Bore points — at least 2 required. */
  points: ProtocolPoint[];

  // --- Optional header fields ---

  /** A10: pipe description, e.g. "Труба:Трубы ЭЛЕКТРОПАЙП ПРО 225/170-N1250 F1, 2шт." */
  pipe_info?: string;
  /** I10: total bore length, m (e.g. 843.8) */
  total_length_m?: number;
  /**
   * A13–A1x: list of completed work steps.
   * e.g. ["1. Пройдена пилотная скважина d=120 мм.", "2. Расширение..."]
   */
  work_steps?: string[];
  /** A17: drilling rig model, e.g. "GD 360C-LS" */
  rig_type?: string;
  /** A19: locating system, e.g. "Underground Magnetics Mag 9" */
  locating_system?: string;
  /** A21: probe type, e.g. "Echo 110" */
  probe_type?: string;
  /** A61: drill rod length in cm (shown as "Длина каждой штанги - N сантиметров") */
  rod_length_cm?: number;
  /** E64: foreman/supervisor name, e.g. "Кононенко А.С." */
  foreman_name?: string;
}
