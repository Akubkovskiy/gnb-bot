/**
 * Document registry types — canonical document tracking for GNB transitions.
 *
 * Registry sits above SourceDocument (intake layer) and adds:
 * - canonical naming with approval flow
 * - document requirements matrix
 * - storage planning
 * - package composition tracking
 */

import type { DocClass, FieldConfidence, SourceType } from "./intake-types.js";

// === Document kind (more granular than DocClass) ===

export type DocumentKind =
  | "executive_scheme"
  | "pipe_passport"
  | "pipe_certificate"
  | "bentonite_passport"
  | "ukpt_doc"
  | "plugs_doc"
  | "cord_doc"
  | "order_sign1"
  | "order_sign2"
  | "order_sign3"
  | "order_tech"
  | "appointment_letter"
  | "prior_internal_act"
  | "prior_aosr"
  | "summary_excel"
  | "photo"
  | "free_text_note"
  | "generated_internal_acts"
  | "generated_aosr"
  | "other";

// === Registry document status ===

export type RegistryDocumentStatus =
  | "detected"                    // extracted from source, not yet named
  | "awaiting_name_confirmation"  // name proposed, waiting owner approval
  | "approved"                    // owner approved canonical name
  | "rejected"                    // owner rejected proposal
  | "superseded"                  // replaced by newer document
  | "linked";                     // linked to finalized transition

// === Registry document ===

export interface RegistryDocument {
  doc_id: string;
  source_id: string;                // links to SourceDocument
  original_file_name?: string;
  kind: DocumentKind;
  doc_class: DocClass;              // original classification

  /** Extracted metadata. */
  doc_number?: string;
  doc_date?: string;
  summary?: string;
  confidence: FieldConfidence;

  /** Related entity (e.g. material name, signatory role). */
  related_entity?: string;

  /** Naming. */
  status: RegistryDocumentStatus;
  name_proposal?: NameProposal;
  approved_name?: string;

  /** Source tracking. */
  source_type: SourceType;
  received_at: string;              // ISO

  /** True if inherited from previous GNB, not sent by owner. */
  inherited: boolean;
  base_transition_id?: string;
}

// === Name proposal ===

export interface NameProposal {
  suggested_name: string;
  complete: boolean;                // false if number/date missing
  missing_parts: string[];          // e.g. ["номер документа", "дата"]
  proposed_at: string;              // ISO
}

// === Document requirement ===

export type RequirementLevel = "required" | "conditional" | "optional";

export interface DocumentRequirement {
  kind: DocumentKind;
  label: string;
  level: RequirementLevel;
  /** When this requirement applies (for conditional docs). */
  condition?: string;
}

export type RequirementStatus = "present" | "inherited" | "missing" | "not_applicable";

export interface RequirementCheck {
  requirement: DocumentRequirement;
  status: RequirementStatus;
  doc_id?: string;                  // ID of the document satisfying this requirement
}

// === Storage plan ===

export interface StoragePlanEntry {
  folder: string;                   // relative path segment
  label: string;
  documents: Array<{
    doc_id?: string;
    file_name: string;
    kind: DocumentKind;
  }>;
}

export interface StoragePlan {
  base_path: string;                // e.g. "Крафт/Марьино/ЗП 5-5"
  folders: StoragePlanEntry[];
}

// === Document registry (per draft/transition) ===

export interface DocumentRegistry {
  documents: RegistryDocument[];
  requirements: RequirementCheck[];
  storage_plan?: StoragePlan;
}
