/**
 * Typed contracts for GNB passport review, inheritance, and conflict presentation.
 *
 * Used by: inheritance.ts, conflicts.ts, passport-builder.ts, review-builder.ts
 */

import type { FieldName, FieldConfidence, SourceType } from "./intake-types.js";

// === Field volatility policy ===

export type FieldVolatility = "stable" | "semi_stable" | "volatile";

export interface FieldPolicy {
  fieldName: FieldName;
  volatility: FieldVolatility;
  label: string; // human-readable Russian label
}

// === Inheritance ===

export interface InheritanceBase {
  /** ID of the base transition (previous GNB). */
  transition_id: string;
  /** Source: "previous_gnb" or "excel_fallback". */
  source: "previous_gnb" | "excel_fallback";
  /** Human label, e.g. "ЗП № 3 (Марьино)". */
  label: string;
}

// === Review sections ===

export interface ReviewInheritedField {
  field_name: FieldName;
  label: string;
  value: unknown;
  source: string; // e.g. "ЗП № 3"
}

export interface ReviewChangedField {
  field_name: FieldName;
  label: string;
  old_value: unknown;
  new_value: unknown;
  old_source: string;
  new_source: string;
}

export interface ReviewNeedsAttentionField {
  field_name: FieldName;
  label: string;
  value: unknown;
  reason: string; // e.g. "обычно меняется между переходами"
}

export interface ReviewMissingField {
  field_name: FieldName;
  label: string;
  required: boolean; // true = blocker, false = warning
}

export interface ReviewConflict {
  field_name: FieldName;
  label: string;
  current_value: unknown;
  candidate_value: unknown;
  current_source: string;
  candidate_source: string;
  reason: string;
  requires_owner_confirmation: true;
}

// === GNB Passport summary ===

export interface GnbPassportSummary {
  /** Identity block. */
  identity: {
    customer?: string;
    object?: string;
    gnb_number?: string;
    project_number?: string;
    title_line?: string;
    object_name?: string;
  };

  /** Geometry block. */
  geometry: {
    address?: string;
    plan_length?: number;
    profile_length?: number;
    pipe_diameter_mm?: number;
    pipe_count?: number;
    drill_diameter?: number;
    configuration?: string;
  };

  /** Organizations block. */
  organizations: {
    customer?: { name: string; short_name?: string };
    contractor?: { name: string; short_name?: string };
    designer?: { name: string; short_name?: string };
  };

  /** Signatories block. */
  signatories: {
    sign1?: { full_name: string; position: string; org: string };
    sign2?: { full_name: string; position: string; org: string };
    sign3?: { full_name: string; position: string; org: string };
    tech?: { full_name: string; position: string; org: string };
  };

  /** Pipe block. */
  pipe: {
    mark?: string;
    quality_passport?: string;
  };

  /** Materials block. */
  materials: {
    bentonite?: { doc_ref?: string };
    ukpt?: { doc_ref?: string };
    plugs?: { doc_ref?: string };
    cord?: { doc_ref?: string };
  };

  /** Dates block. */
  dates: {
    start_date?: { day: number; month: string; year: number };
    end_date?: { day: number; month: string; year: number };
    act_date?: { day: number; month: string; year: number };
  };

  /** Source summary. */
  meta: {
    base_transition_id?: string;
    source_documents_count: number;
    extracted_fields_count: number;
    has_executive_scheme: boolean;
  };
}

// === Full review report ===

export interface ReviewReport {
  passport: GnbPassportSummary;
  inherited: ReviewInheritedField[];
  changed: ReviewChangedField[];
  needs_attention: ReviewNeedsAttentionField[];
  missing: ReviewMissingField[];
  conflicts: ReviewConflict[];
  /** True if no blocking missing fields and no unresolved conflicts. */
  ready_for_confirmation: boolean;
}
