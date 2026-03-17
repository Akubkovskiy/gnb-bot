/**
 * Contracts for Claude reasoning skills.
 *
 * These define the structured input/output for each skill.
 * Code assembles input from retrieval → skill reasons → code validates output.
 */

// === Common types ===

export type IntentType =
  | "field_update"        // "даты 10.12.2025 - 22.12.2025"
  | "signatory_assignment"// "технадзор Гайдуков"
  | "lookup_query"        // "что у нас по Гайдукову?"
  | "reuse_request"       // "возьми паспорт из прошлого ГНБ"
  | "manual_override"     // "объект не Марьино, а ..."
  | "absence_declaration" // "Стройтреста нет"
  | "confirmation"        // "да" / "нет"
  | "question"            // "какие паспорта были?"
  | "unknown";

// === gnb-intake-reasoning ===

export interface IntakeReasoningInput {
  /** Owner's message text. */
  message: string;
  /** Current draft summary (field names + values). */
  draftSummary: Record<string, unknown>;
  /** Retrieval context: people found, object profile, etc. */
  retrievalContext: {
    mentionedPeople?: Array<{
      personId: string;
      fullName: string;
      position?: string | null;
      org?: string;
      currentDocs?: Array<{ docType: string; docNumber?: string | null; docDate?: string | null }>;
    }>;
    objectProfile?: {
      shortName: string;
      officialName?: string | null;
      lastGnb?: string;
      lastSignatories?: Array<{ role: string; fullName: string; orgName?: string | null }>;
    };
  };
  /** Required fields still missing. */
  missingFields: string[];
}

export interface IntakeReasoningOutput {
  /** Detected intent. */
  intent: IntentType;
  /** Field updates to apply. */
  fieldUpdates: Array<{
    fieldName: string;
    value: unknown;
    confidence: "high" | "medium" | "low";
    source: string; // "owner_text", "db_lookup", "inferred"
  }>;
  /** Signatory assignments. */
  signatoryUpdates?: Array<{
    role: string;
    personId: string;
    action: "assign" | "remove" | "confirm" | "needs_manual";
    /** If action=needs_manual and person not in DB, partially extracted data. */
    newPersonData?: { fullName?: string; position?: string; org?: string };
  }>;
  /** Questions to ask owner (if any). */
  questionsForOwner?: string[];
  /** Owner-facing summary of what was understood. */
  summary: string;
}

// === gnb-draft-advisor ===

export interface DraftAdvisorInput {
  /** Current draft fields. */
  draftFields: Record<string, unknown>;
  /** Base transition data (if inherited). */
  baseTransition?: {
    gnbNumber: string;
    signatories: Array<{ role: string; personId: string; fullName: string }>;
    address?: string | null;
    projectNumber?: string | null;
    pipeMark?: string | null;
  };
  /** Retrieval context. */
  objectProfile?: {
    shortName: string;
    officialName?: string | null;
    transitions: Array<{ gnbNumber: string; status: string }>;
    lastSignatories: Array<{ role: string; fullName: string; orgName?: string | null }>;
  };
  /** What's missing. */
  missingFields: string[];
  /** Unresolved conflicts. */
  conflicts: Array<{ fieldName: string; currentValue: unknown; candidateValue: unknown }>;
}

export interface DraftAdvisorOutput {
  /** Fields to auto-fill from DB. */
  autoFill: Array<{
    fieldName: string;
    value: unknown;
    source: string; // "base_transition", "db_person", "db_material"
    reason: string;
  }>;
  /** Reuse suggestions for owner. */
  reuseSuggestions: Array<{
    what: string; // "паспорт трубы", "технадзор", "материалы"
    fromWhere: string; // "ЗП № 5-5", "база"
    details: string;
  }>;
  /** Fields that need owner decision. */
  needsDecision: Array<{
    fieldName: string;
    reason: string;
    options: string[];
  }>;
  /** Summary for owner. */
  summary: string;
}

// === gnb-conflict-resolver ===

export interface ConflictResolverInput {
  /** The specific conflict. */
  conflict: {
    fieldName: string;
    fieldLabel: string;
    currentValue: unknown;
    currentSource: string;
    candidateValue: unknown;
    candidateSource: string;
  };
  /** Context about both values. */
  context?: string;
}

export interface ConflictResolverOutput {
  /** Explanation for owner. */
  explanation: string;
  /** Recommended action. */
  recommendation: "accept_new" | "keep_old" | "needs_manual" | "use_from_db";
  /** Reason for recommendation. */
  reason: string;
}

// === gnb-review-narrator ===

export interface ReviewNarratorInput {
  /** Passport summary. */
  passport: Record<string, unknown>;
  /** Inherited fields count. */
  inheritedCount: number;
  /** Changed fields. */
  changedFields: Array<{ label: string; oldValue: string; newValue: string }>;
  /** Fields needing attention. */
  attentionFields: Array<{ label: string; value: string; reason: string }>;
  /** Missing required. */
  missingRequired: Array<{ label: string }>;
  /** Conflicts. */
  conflicts: Array<{ label: string; current: string; candidate: string }>;
  /** Document coverage. */
  documentCoverage: { present: number; required: number; missing: string[] };
}

export interface ReviewNarratorOutput {
  /** Owner-facing review text (Telegram-ready). */
  reviewText: string;
  /** Is ready for confirmation? */
  readyForConfirmation: boolean;
  /** Blocking reasons (if not ready). */
  blockers?: string[];
}

// === gnb-knowledge-ingest ===

export type IngestDocKind =
  | "person_document"
  | "pipe_document"
  | "material_document"
  | "scheme"
  | "reference_act"
  | "organization_document"
  | "unknown";

export interface KnowledgeIngestInput {
  /** What Claude extracted from the document. */
  extractedData: Record<string, unknown>;
  /** Document classification. */
  docClass: string;
  /** File name. */
  fileName: string;
  /** People found in DB that match extracted names. */
  matchedPeople: Array<{ personId: string; fullName: string; org?: string }>;
  /** Materials found in DB. */
  matchedMaterials: Array<{ materialId: string; name: string; type: string }>;
  /** Objects in DB. */
  knownObjects: Array<{ objectId: string; shortName: string; customerName: string }>;
}

export interface KnowledgeIngestOutput {
  /** What kind of knowledge this is. */
  docKind: IngestDocKind;
  /** Extracted structured data. */
  extractedData: Record<string, unknown>;
  /** Suggested entity links. */
  suggestedLinks: {
    personId?: string | null;
    objectId?: string | null;
    materialId?: string | null;
    transitionId?: string | null;
  };
  /** Links that couldn't be determined. */
  missingLinks: string[];
  /** Questions to ask owner for missing links. */
  questionsForOwner: string[];
  /** Human summary. */
  summary: string;
}
