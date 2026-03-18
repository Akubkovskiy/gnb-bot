/**
 * Debug view model for field mapping verification.
 *
 * Single source of truth for debug review (Telegram) and debug JSON snapshot.
 * Adapts over existing IntakeDraft.fields — no parallel payload.
 *
 * Enabled via /review_gnb_debug command or DEBUG_MODE env var.
 */

import type { IntakeDraft, ExtractedField, FieldName, SourceType, FieldConfidence } from "./intake-types.js";
import type { Transition } from "../domain/types.js";
import { getFieldLabel } from "./field-policy.js";
import { REQUIRED_FIELDS, DESIRED_FIELDS } from "./intake-types.js";

// === Debug field entry ===

export interface DebugFieldEntry {
  field_name: FieldName;
  label: string;
  resolved_value: unknown;
  source_type: SourceType;
  source_id: string;
  confidence: FieldConfidence;
  confirmed_by_owner: boolean;
  inherited: boolean;
  conflict_with_existing: boolean;
  required: boolean;
  desired: boolean;
  notes?: string;
}

// === Debug snapshot ===

export interface DebugSnapshot {
  draft_id: string;
  timestamp: string;
  base_transition_id?: string;
  fields: DebugFieldEntry[];
  sources: Array<{
    source_id: string;
    source_type: SourceType;
    doc_class: string;
    original_file_name?: string;
    parse_status: string;
  }>;
  /** Resolved data as it would go to generation. */
  resolved_data: Partial<Transition>;
  /** Counts. */
  stats: {
    total_fields: number;
    inherited_fields: number;
    manual_fields: number;
    extracted_fields: number;
    db_derived_fields: number;
    conflict_fields: number;
    confirmed_fields: number;
  };
}

// === Build functions ===

/**
 * Build debug field entries from draft.
 * This is the single adapter over existing draft fields.
 */
export function buildDebugFieldEntries(draft: IntakeDraft): DebugFieldEntry[] {
  const entries: DebugFieldEntry[] = [];

  // Process all non-conflict fields (resolved values)
  const resolvedFields = draft.fields.filter((f) => !f.conflict_with_existing);

  for (const field of resolvedFields) {
    entries.push(fieldToDebugEntry(field, draft));
  }

  // Add conflict candidates as separate entries
  const conflictFields = draft.fields.filter((f) => f.conflict_with_existing);
  for (const field of conflictFields) {
    const entry = fieldToDebugEntry(field, draft);
    entry.notes = `CONFLICT CANDIDATE (current resolved above)`;
    entries.push(entry);
  }

  return entries;
}

/**
 * Build full debug snapshot.
 */
export function buildDebugSnapshot(draft: IntakeDraft): DebugSnapshot {
  const fields = buildDebugFieldEntries(draft);
  const resolvedFields = fields.filter((f) => !f.conflict_with_existing || !f.notes?.includes("CONFLICT"));

  return {
    draft_id: draft.id,
    timestamp: new Date().toISOString(),
    base_transition_id: draft.base_transition_id,
    fields,
    sources: draft.sources.map((s) => ({
      source_id: s.source_id,
      source_type: s.source_type,
      doc_class: s.doc_class,
      original_file_name: s.original_file_name,
      parse_status: s.parse_status,
    })),
    resolved_data: draft.data,
    stats: {
      total_fields: resolvedFields.length,
      inherited_fields: resolvedFields.filter((f) => f.inherited).length,
      manual_fields: resolvedFields.filter((f) => f.source_type === "manual_text").length,
      extracted_fields: resolvedFields.filter((f) => ["pdf", "photo", "excel"].includes(f.source_type)).length,
      db_derived_fields: resolvedFields.filter((f) => f.source_type === "memory" || f.source_type === "inferred").length,
      conflict_fields: fields.filter((f) => f.conflict_with_existing).length,
      confirmed_fields: resolvedFields.filter((f) => f.confirmed_by_owner).length,
    },
  };
}

/**
 * Format debug snapshot for Telegram (compact, readable).
 */
export function formatDebugReview(snapshot: DebugSnapshot): string {
  const lines: string[] = [];

  lines.push("🔍 DEBUG REVIEW");
  lines.push(`Draft: ${snapshot.draft_id}`);
  if (snapshot.base_transition_id) {
    lines.push(`Base: ${snapshot.base_transition_id}`);
  }
  lines.push(`Sources: ${snapshot.sources.length}`);
  lines.push("");

  // Stats
  const s = snapshot.stats;
  lines.push(
    `Fields: ${s.total_fields} total | ${s.inherited_fields} inherited | ${s.manual_fields} manual | ${s.extracted_fields} extracted | ${s.db_derived_fields} db | ${s.conflict_fields} conflicts`,
  );
  lines.push("");

  // Group by category for readability
  const categories: Array<{ title: string; prefix: string }> = [
    { title: "IDENTITY", prefix: "" },
    { title: "ORGS", prefix: "organizations." },
    { title: "SIGNATORIES", prefix: "signatories." },
    { title: "DATES", prefix: "" },
    { title: "GNB PARAMS", prefix: "gnb_params." },
    { title: "PIPE/MATERIALS", prefix: "" },
  ];

  const identityKeys = new Set(["customer", "object", "object_name", "title_line", "gnb_number", "gnb_number_short", "address", "project_number", "executor"]);
  const dateKeys = new Set(["start_date", "end_date", "act_date"]);
  const pipeKeys = new Set<string>(["pipe", "materials"]);

  // All resolved fields (no conflict candidates)
  const resolved = snapshot.fields.filter((f) => !f.notes?.includes("CONFLICT"));

  function formatFieldsInCategory(filter: (f: DebugFieldEntry) => boolean): void {
    const matched = resolved.filter(filter);
    for (const f of matched) {
      const flags: string[] = [];
      if (f.inherited) flags.push("INH");
      if (f.confirmed_by_owner) flags.push("CONF");
      if (f.conflict_with_existing) flags.push("CONFL");
      if (f.confidence !== "high") flags.push(f.confidence.toUpperCase());

      const valueStr = formatDebugValue(f.resolved_value);
      const flagStr = flags.length > 0 ? ` [${flags.join(",")}]` : "";

      lines.push(`  ${f.field_name}`);
      lines.push(`    ${f.label}: ${valueStr}`);
      lines.push(`    src=${f.source_type} id=${f.source_id}${flagStr}`);
    }
  }

  lines.push("--- IDENTITY ---");
  formatFieldsInCategory((f) => identityKeys.has(f.field_name));

  lines.push("--- ORGS ---");
  formatFieldsInCategory((f) => f.field_name.startsWith("organizations."));

  lines.push("--- SIGNATORIES ---");
  formatFieldsInCategory((f) => f.field_name.startsWith("signatories."));

  lines.push("--- DATES ---");
  formatFieldsInCategory((f) => dateKeys.has(f.field_name));

  lines.push("--- GNB PARAMS ---");
  formatFieldsInCategory((f) => f.field_name.startsWith("gnb_params."));

  lines.push("--- PIPE/MATERIALS ---");
  formatFieldsInCategory((f) => pipeKeys.has(f.field_name));

  // Conflicts section
  const conflicts = snapshot.fields.filter((f) => f.notes?.includes("CONFLICT"));
  if (conflicts.length > 0) {
    lines.push("");
    lines.push("--- CONFLICTS ---");
    for (const c of conflicts) {
      lines.push(`  ${c.field_name}: ${formatDebugValue(c.resolved_value)}`);
      lines.push(`    src=${c.source_type} id=${c.source_id}`);
    }
  }

  // Missing required
  const resolvedNames = new Set(resolved.map((f) => f.field_name));
  const missingRequired = REQUIRED_FIELDS.filter((f) => !resolvedNames.has(f));
  if (missingRequired.length > 0) {
    lines.push("");
    lines.push("--- MISSING REQUIRED ---");
    for (const f of missingRequired) {
      lines.push(`  ${f} (${getFieldLabel(f)})`);
    }
  }

  return lines.join("\n");
}

// === Helpers ===

function fieldToDebugEntry(field: ExtractedField, draft: IntakeDraft): DebugFieldEntry {
  const isInherited = field.source_type === "prior_act" || field.source_type === "memory"
    || (draft.base_transition_id != null && field.source_id.startsWith("base:"));

  return {
    field_name: field.field_name,
    label: getFieldLabel(field.field_name),
    resolved_value: field.value,
    source_type: field.source_type,
    source_id: field.source_id,
    confidence: field.confidence,
    confirmed_by_owner: field.confirmed_by_owner,
    inherited: isInherited,
    conflict_with_existing: field.conflict_with_existing,
    required: REQUIRED_FIELDS.includes(field.field_name),
    desired: DESIRED_FIELDS.includes(field.field_name),
    notes: field.notes,
  };
}

function formatDebugValue(v: unknown): string {
  if (v === undefined || v === null) return "—";
  if (typeof v === "string") return v.length > 80 ? v.slice(0, 77) + "..." : v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v !== "object") return String(v);

  const obj = v as Record<string, unknown>;

  // Signatory
  if ("full_name" in obj && "position" in obj) {
    return `${obj.full_name}, ${obj.position}${obj.org ? ` (${obj.org})` : ""}`;
  }
  // Organization
  if ("name" in obj && "short_name" in obj) {
    return `${obj.short_name || obj.name}`;
  }
  // Date
  if ("day" in obj && "month" in obj && "year" in obj) {
    return `${obj.day} ${obj.month} ${obj.year}`;
  }
  // Pipe
  if ("mark" in obj) {
    return `${obj.mark}${obj.diameter_mm ? ` d=${obj.diameter_mm}` : ""}`;
  }

  return JSON.stringify(v).slice(0, 100);
}
