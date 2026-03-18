/**
 * Conflict detection — compares current draft fields against base transition or new extractions.
 *
 * No silent resolution: all conflicts require owner confirmation.
 */

import type { IntakeDraft, FieldName, ExtractedField } from "./intake-types.js";
import type { Transition } from "../domain/types.js";
import type { ReviewConflict } from "./review-types.js";
import { getFieldLabel, getVolatility, isRoutingField, isSchemeAuthoritative } from "./field-policy.js";

/**
 * Detect conflicts between draft fields and a base transition.
 * Compares current active field values against base values.
 */
export function detectBaseConflicts(
  draft: IntakeDraft,
  base: Transition,
): ReviewConflict[] {
  const conflicts: ReviewConflict[] = [];

  for (const field of draft.fields) {
    if (field.conflict_with_existing) continue; // already a conflict candidate
    if (field.source_id?.startsWith("base:")) continue; // inherited from same base
    if (getVolatility(field.field_name) === "volatile") continue; // volatile fields expected to differ
    if (isRoutingField(field.field_name)) continue; // routing context ≠ doc fields
    if (isSchemeAuthoritative(field.field_name)) continue; // scheme auto-applied, shown as "changed" not conflict

    const baseValue = getBaseFieldValue(base, field.field_name);
    if (baseValue === undefined) continue;

    if (!valuesMatch(field.value, baseValue)) {
      conflicts.push({
        field_name: field.field_name,
        label: getFieldLabel(field.field_name),
        current_value: field.value,
        candidate_value: baseValue,
        current_source: field.source_id,
        candidate_source: `base:${base.id}`,
        reason: "Значение отличается от предыдущего ГНБ",
        requires_owner_confirmation: true,
      });
    }
  }

  return conflicts;
}

/**
 * Detect unresolved conflicts within draft fields (multiple values for same field).
 */
export function detectInternalConflicts(draft: IntakeDraft): ReviewConflict[] {
  const conflicts: ReviewConflict[] = [];

  // Group fields by field_name
  const byName = new Map<FieldName, ExtractedField[]>();
  for (const f of draft.fields) {
    const arr = byName.get(f.field_name) || [];
    arr.push(f);
    byName.set(f.field_name, arr);
  }

  for (const [fieldName, entries] of byName) {
    const active = entries.find((e) => !e.conflict_with_existing);
    const conflicting = entries.filter((e) => e.conflict_with_existing);

    if (!active || conflicting.length === 0) continue;

    for (const candidate of conflicting) {
      conflicts.push({
        field_name: fieldName,
        label: getFieldLabel(fieldName),
        current_value: active.value,
        candidate_value: candidate.value,
        current_source: active.source_id,
        candidate_source: candidate.source_id,
        reason: "Несколько значений из разных источников",
        requires_owner_confirmation: true,
      });
    }
  }

  return conflicts;
}

/**
 * Get all conflicts for a draft (base + internal).
 */
export function getAllConflicts(
  draft: IntakeDraft,
  base?: Transition,
): ReviewConflict[] {
  const internal = detectInternalConflicts(draft);
  const baseConflicts = base ? detectBaseConflicts(draft, base) : [];
  return [...internal, ...baseConflicts];
}

// === Helpers ===

export function getBaseFieldValue(base: Transition, fieldName: FieldName): unknown {
  switch (fieldName) {
    case "customer": return base.customer;
    case "object": return base.object;
    case "object_name": return base.object_name;
    case "title_line": return base.title_line;
    case "address": return base.address;
    case "project_number": return base.project_number;
    case "executor": return base.executor;
    case "gnb_number": return base.gnb_number;
    case "start_date": return base.start_date;
    case "end_date": return base.end_date;
    case "organizations.customer": return base.organizations?.customer;
    case "organizations.contractor": return base.organizations?.contractor;
    case "organizations.designer": return base.organizations?.designer;
    case "signatories.sign1_customer": return base.signatories?.sign1_customer;
    case "signatories.sign2_contractor": return base.signatories?.sign2_contractor;
    case "signatories.sign3_optional": return base.signatories?.sign3_optional;
    case "signatories.tech_supervisor": return base.signatories?.tech_supervisor;
    case "pipe": return base.pipe;
    case "materials": return base.materials;
    case "gnb_params.profile_length": return base.gnb_params?.profile_length;
    case "gnb_params.plan_length": return base.gnb_params?.plan_length;
    case "gnb_params.pipe_count": return base.gnb_params?.pipe_count;
    case "gnb_params.drill_diameter": return base.gnb_params?.drill_diameter;
    default: return undefined;
  }
}

export function valuesMatch(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;

  // Numeric tolerance
  if (typeof a === "number" && typeof b === "number") {
    return Math.abs(a - b) < 0.01;
  }

  // String compare (case-insensitive trim)
  if (typeof a === "string" && typeof b === "string") {
    return a.trim().toLowerCase() === b.trim().toLowerCase();
  }

  // Deep compare for objects — normalize to avoid key-order / undefined-property issues
  if (typeof a === "object" && typeof b === "object") {
    return normalizedJsonEqual(a, b);
  }

  return false;
}

/** Deep-equal that ignores key order and strips undefined values. */
function normalizedJsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
}

function sortKeys(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(sortKeys);
  if (typeof obj === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
      const val = (obj as Record<string, unknown>)[key];
      if (val !== undefined) sorted[key] = sortKeys(val);
    }
    return sorted;
  }
  return obj;
}
