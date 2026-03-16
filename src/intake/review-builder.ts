/**
 * Review builder — produces ReviewReport from IntakeDraft.
 *
 * Sections:
 * 1. Inherited — fields taken from base transition
 * 2. Changed — fields that differ from base
 * 3. Needs attention — semi-stable fields inherited but not confirmed
 * 4. Missing — required/desired fields not yet set
 * 5. Conflicts — unresolved multi-value conflicts
 */

import type { IntakeDraft, FieldName } from "./intake-types.js";
import { REQUIRED_FIELDS, DESIRED_FIELDS } from "./intake-types.js";
import type { Transition } from "../domain/types.js";
import type {
  ReviewReport,
  ReviewInheritedField,
  ReviewChangedField,
  ReviewNeedsAttentionField,
  ReviewMissingField,
} from "./review-types.js";
import { buildPassportSummary, requiresGeometryManualInput, hasExecutiveSchemeSource } from "./passport-builder.js";
import { getAllConflicts } from "./conflicts.js";
import { getFieldLabel, getVolatility, needsAttentionIfInherited } from "./field-policy.js";

/**
 * Build full review report for a draft.
 * @param draft - the intake draft
 * @param base - optional base transition (previous GNB)
 */
export function buildReviewReport(
  draft: IntakeDraft,
  base?: Transition,
): ReviewReport {
  const passport = buildPassportSummary(draft);
  const inherited = buildInheritedReport(draft, base);
  const changed = buildChangedReport(draft, base);
  const needs_attention = buildNeedsAttentionReport(draft);
  const missing = buildMissingReport(draft);
  const conflicts = getAllConflicts(draft, base);

  // Add scheme requirement to missing if needed
  if (!hasExecutiveSchemeSource(draft) && requiresGeometryManualInput(draft)) {
    const hasSchemeEntry = missing.some((m) => m.field_name === "gnb_params.profile_length");
    if (!hasSchemeEntry) {
      missing.push({
        field_name: "gnb_params.profile_length",
        label: "ИС PDF / L профиль",
        required: true,
      });
    }
  }

  const hasBlockers = missing.some((m) => m.required);
  const hasConflicts = conflicts.length > 0;
  const ready_for_confirmation = !hasBlockers && !hasConflicts;

  return { passport, inherited, changed, needs_attention, missing, conflicts, ready_for_confirmation };
}

// === Section builders ===

function buildInheritedReport(draft: IntakeDraft, base?: Transition): ReviewInheritedField[] {
  if (!base) return [];
  const inherited: ReviewInheritedField[] = [];
  const baseSourcePrefix = `base:${base.id}`;

  for (const field of draft.fields) {
    if (field.conflict_with_existing) continue;
    if (!field.source_id?.startsWith(baseSourcePrefix)) continue;

    inherited.push({
      field_name: field.field_name,
      label: getFieldLabel(field.field_name),
      value: field.value,
      source: base.gnb_number || base.id,
    });
  }

  return inherited;
}

function buildChangedReport(draft: IntakeDraft, base?: Transition): ReviewChangedField[] {
  if (!base) return [];
  const changed: ReviewChangedField[] = [];
  const baseSourcePrefix = `base:${base.id}`;

  for (const field of draft.fields) {
    if (field.conflict_with_existing) continue;
    if (field.source_id?.startsWith(baseSourcePrefix)) continue; // inherited, not changed

    // Check if base had a different value
    const baseField = draft.fields.find(
      (f) => f.field_name === field.field_name && f.source_id?.startsWith(baseSourcePrefix) && f.conflict_with_existing,
    );
    // Or compare with base transition directly
    if (baseField) {
      changed.push({
        field_name: field.field_name,
        label: getFieldLabel(field.field_name),
        old_value: baseField.value,
        new_value: field.value,
        old_source: base.gnb_number || base.id,
        new_source: field.source_id,
      });
    }
  }

  return changed;
}

function buildNeedsAttentionReport(draft: IntakeDraft): ReviewNeedsAttentionField[] {
  const attention: ReviewNeedsAttentionField[] = [];

  for (const field of draft.fields) {
    if (field.conflict_with_existing) continue;
    if (!needsAttentionIfInherited(field.field_name)) continue;
    if (field.confirmed_by_owner) continue;
    if (field.source_type === "manual_text") continue; // owner explicitly set it

    attention.push({
      field_name: field.field_name,
      label: getFieldLabel(field.field_name),
      value: field.value,
      reason: "Обычно меняется между переходами — проверьте актуальность",
    });
  }

  return attention;
}

function buildMissingReport(draft: IntakeDraft): ReviewMissingField[] {
  const missing: ReviewMissingField[] = [];
  const activeFields = new Set(
    draft.fields.filter((f) => !f.conflict_with_existing).map((f) => f.field_name),
  );

  for (const fieldName of REQUIRED_FIELDS) {
    if (!activeFields.has(fieldName)) {
      missing.push({
        field_name: fieldName,
        label: getFieldLabel(fieldName),
        required: true,
      });
    }
  }

  for (const fieldName of DESIRED_FIELDS) {
    if (!activeFields.has(fieldName)) {
      missing.push({
        field_name: fieldName,
        label: getFieldLabel(fieldName),
        required: false,
      });
    }
  }

  return missing;
}

// === Base summary helpers ===

export interface BaseSummary {
  signatories: Array<{ role: string; full_name: string; position: string; org: string }>;
  pipe?: { mark: string; quality_passport?: string };
  materials_summary: string;
  orgs: Array<{ role: string; name: string }>;
}

/**
 * Summarize what's available in the base transition.
 * Useful for answering "что есть актуальное в базе?"
 */
export function summarizeBase(base: Transition): BaseSummary {
  const signatories: BaseSummary["signatories"] = [];
  const s = base.signatories;
  if (s?.sign1_customer) signatories.push({ role: "Мастер РЭС", full_name: s.sign1_customer.full_name, position: s.sign1_customer.position, org: s.sign1_customer.org_description });
  if (s?.sign2_contractor) signatories.push({ role: "Подрядчик", full_name: s.sign2_contractor.full_name, position: s.sign2_contractor.position, org: s.sign2_contractor.org_description });
  if (s?.sign3_optional) signatories.push({ role: "Субподрядчик", full_name: s.sign3_optional.full_name, position: s.sign3_optional.position, org: s.sign3_optional.org_description });
  if (s?.tech_supervisor) signatories.push({ role: "Технадзор", full_name: s.tech_supervisor.full_name, position: s.tech_supervisor.position, org: s.tech_supervisor.org_description });

  const orgs: BaseSummary["orgs"] = [];
  const o = base.organizations;
  if (o?.customer) orgs.push({ role: "Заказчик", name: o.customer.short_name || o.customer.name });
  if (o?.contractor) orgs.push({ role: "Подрядчик", name: o.contractor.short_name || o.contractor.name });
  if (o?.designer) orgs.push({ role: "Проектировщик", name: o.designer.short_name || o.designer.name });

  return {
    signatories,
    pipe: base.pipe ? { mark: base.pipe.mark, quality_passport: base.pipe.quality_passport } : undefined,
    materials_summary: base.materials ? "Материалы есть" : "Материалы не заданы",
    orgs,
  };
}
