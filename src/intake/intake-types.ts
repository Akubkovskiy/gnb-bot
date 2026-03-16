/**
 * Intake types for Draft Intake Mode.
 *
 * IntakeDraft is a container for a GNB transition being assembled
 * from multiple sources (text, PDF, photo, Excel, memory).
 *
 * Does NOT replace the existing Draft type (flow v1).
 * At finalization, IntakeDraft → Transition (same contract for renderers).
 */

import type { Transition, DateComponents, Organization, Signatory, Pipe, Materials, GnbParams } from "../domain/types.js";

// === Draft status ===

export type IntakeDraftStatus =
  | "collecting"             // accepting new materials
  | "awaiting_confirmation"  // data collected, waiting for owner confirm
  | "ready"                  // confirmed, ready for generation
  | "missing_data"           // has blocking gaps
  | "finalized";             // acts generated

// === Source document ===

export type SourceType =
  | "manual_text"
  | "pdf"
  | "photo"
  | "excel"
  | "prior_act"
  | "memory"
  | "inferred";

export type DocClass =
  | "passport_pipe"
  | "certificate"
  | "executive_scheme"
  | "order"
  | "appointment_letter"
  | "prior_internal_act"
  | "prior_aosr"
  | "summary_excel"
  | "photo_of_doc"
  | "free_text_note"
  | "unknown";

export interface SourceDocument {
  source_id: string;
  source_type: SourceType;
  original_file_name?: string;
  doc_class: DocClass;
  received_at: string;        // ISO
  parse_status: "pending" | "parsed" | "failed";
  short_summary?: string;
}

// === Extracted field ===

export type FieldConfidence = "high" | "medium" | "low";

/** Name of any transition target field that can be extracted. */
export type FieldName =
  // Base identity
  | "customer" | "object" | "object_name" | "title_line"
  | "gnb_number" | "gnb_number_short" | "address"
  | "project_number" | "executor"
  // Dates
  | "start_date" | "end_date" | "act_date"
  // Organizations
  | "organizations.customer" | "organizations.contractor" | "organizations.designer"
  // Signatories
  | "signatories.sign1_customer" | "signatories.sign2_contractor"
  | "signatories.sign3_optional" | "signatories.tech_supervisor"
  // Pipe / materials
  | "pipe" | "materials"
  // GNB params
  | "gnb_params.profile_length" | "gnb_params.plan_length"
  | "gnb_params.pipe_count" | "gnb_params.drill_diameter"
  | "gnb_params.configuration";

export interface ExtractedField {
  field_name: FieldName;
  value: unknown;
  source_id: string;
  source_type: SourceType;
  confidence: FieldConfidence;
  confirmed_by_owner: boolean;
  conflict_with_existing: boolean;
  notes?: string;
}

// === IntakeDraft ===

export interface IntakeDraft {
  id: string;
  chat_id: number;
  status: IntakeDraftStatus;
  created_at: string;   // ISO
  updated_at: string;   // ISO

  /** All source documents received for this draft. */
  sources: SourceDocument[];

  /** Extracted field values with provenance. */
  fields: ExtractedField[];

  /**
   * Accumulated transition data (built from fields).
   * Partial — filled progressively as data arrives.
   * At finalization, validated and converted to full Transition.
   */
  data: Partial<Transition>;

  /** ID of a prior transition used as base (optional). */
  base_transition_id?: string;
}

// === Completeness check ===

/** Fields required for generation (blockers if missing). */
export const REQUIRED_FIELDS: FieldName[] = [
  "customer", "object", "address",
  "gnb_number",
  "start_date", "end_date",
  "signatories.sign1_customer",
  "signatories.sign2_contractor",
  "signatories.tech_supervisor",
  "gnb_params.profile_length",
  "organizations.customer",
  "organizations.contractor",
];

/** Fields that are nice to have (warnings if missing). */
export const DESIRED_FIELDS: FieldName[] = [
  "project_number",
  "pipe",
  "gnb_params.plan_length",
  "signatories.sign3_optional",
  "title_line",
  "object_name",
  "executor",
];

// === Intake response ===

export interface IntakeResponse {
  message: string;
  done?: boolean;
  /** Set when finalization succeeds — handler uses this to trigger rendering. */
  transition?: Transition;
}

// === Stores bundle for intake ===

export interface IntakeStores {
  intakeDrafts: import("../store/intake-drafts.js").IntakeDraftStore;
  transitions: import("../store/transitions.js").TransitionStore;
  customers: import("../store/customers.js").CustomerStore;
  people: import("../store/people.js").PeopleStore;
}
