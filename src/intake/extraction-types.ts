/**
 * Typed contracts for document extraction pipeline.
 *
 * ExtractionResult is the output of the extraction pipeline:
 *   file → classify → Claude extraction → normalize → ExtractionResult
 *
 * Consumers: field mapper → IntakeDraftStore.setField()
 */

import type { DocClass, FieldConfidence, SourceType } from "./intake-types.js";

// === Material subtypes ===

export type MaterialSubtype =
  | "bentonite"
  | "ukpt"
  | "plugs"
  | "cord"
  | "other";

// === Extraction result ===

export interface ExtractionResult {
  /** Classified document type. */
  doc_class: DocClass;
  /** Material subtype for material-related docs. */
  material_subtype?: MaterialSubtype;
  /** One-line summary for display. */
  summary: string;
  /** Raw Claude response (preserved for debug). */
  raw_response: string;

  /** Extracted key-value fields. */
  fields: ExtractionField[];
  /** Warnings from extraction (e.g., "дата не найдена"). */
  warnings: string[];
  /** Ambiguities (multiple candidates for one field). */
  ambiguities: ExtractionAmbiguity[];

  /** Document number, if found. */
  doc_number?: string;
  /** Document date, if found. */
  doc_date?: string;

  /** Parts for suggested canonical filename. */
  suggested_name_parts?: {
    doc_type_label: string;
    number?: string;
    date?: string;
    extra?: string;
  };

  /** Extraction confidence. */
  confidence: FieldConfidence;
  /** Source type inferred from file. */
  source_type: SourceType;
}

/** A single extracted field from a document. */
export interface ExtractionField {
  key: string;               // raw key from Claude, e.g. "gnb_number", "full_name"
  value: string | number;    // extracted value
  confidence: FieldConfidence;
  notes?: string;            // extraction notes (e.g., "partially obscured")
}

/** When Claude found multiple candidates for one field. */
export interface ExtractionAmbiguity {
  key: string;
  candidates: Array<{ value: string | number; source_hint?: string }>;
  notes?: string;
}

// === Prompt config per doc_class ===

export interface ExtractionPromptConfig {
  doc_class: DocClass;
  /** Fields to extract (used in prompt generation). */
  target_fields: string[];
  /** System instruction additions for this doc type. */
  instructions: string;
}

// === Claude raw extraction (before normalization) ===

/** Raw key-value pair parsed from Claude's response. */
export interface RawExtractionPair {
  key: string;
  value: string;
}
