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
  /** Project/object title (fills the header). */
  object_title: string;
  /** Transition/bore number, e.g. "№1-1". */
  transition_number: string;
  /** Date shown on the protocol. */
  date: Date;
  /** Bore start date (if different from date). */
  date_start?: Date;
  /** Bore end date (if different from date). */
  date_end?: Date;
  /** Bore points — at least 2 required. */
  points: ProtocolPoint[];
}
