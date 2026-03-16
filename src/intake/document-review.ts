/**
 * Document review layer — builds document coverage summary for review.
 */

import type { IntakeDraft } from "./intake-types.js";
import type { Transition } from "../domain/types.js";
import type { DocumentRegistry, RequirementCheck, RegistryDocument } from "./document-registry-types.js";
import { buildDocumentRegistry, getReusableBaseDocuments, type ReusableDoc } from "./document-registry.js";
import { getMissingRequired, getMissingConditional, getMissingOptional } from "./document-requirements.js";

export interface DocumentReviewSummary {
  /** Total documents in registry. */
  total_documents: number;
  /** Documents with approved names. */
  approved_names: number;
  /** Documents awaiting name approval. */
  pending_names: number;

  /** Required docs present. */
  required_present: number;
  required_total: number;

  /** Missing required documents. */
  missing_required: RequirementCheck[];
  /** Missing conditional documents. */
  missing_conditional: RequirementCheck[];
  /** Missing optional documents. */
  missing_optional: RequirementCheck[];

  /** Documents inherited from previous GNB. */
  inherited_count: number;

  /** Reusable docs from base (if base provided). */
  reusable_from_base: ReusableDoc[];

  /** Full registry for detailed inspection. */
  registry: DocumentRegistry;
}

/**
 * Build document review summary for an intake draft.
 */
export function buildDocumentReview(
  draft: IntakeDraft,
  base?: Transition,
): DocumentReviewSummary {
  const registry = buildDocumentRegistry(draft);
  const { documents, requirements } = registry;

  const missingReq = getMissingRequired(requirements);
  const missingCond = getMissingConditional(requirements);
  const missingOpt = getMissingOptional(requirements);

  const requiredTotal = requirements.filter((r) => r.requirement.level === "required").length;
  const requiredPresent = requiredTotal - missingReq.length;

  const reusable = base ? getReusableBaseDocuments(base) : [];

  return {
    total_documents: documents.length,
    approved_names: documents.filter((d) => d.status === "approved").length,
    pending_names: documents.filter((d) => d.name_proposal && !d.name_proposal.complete).length,
    required_present: requiredPresent,
    required_total: requiredTotal,
    missing_required: missingReq,
    missing_conditional: missingCond,
    missing_optional: missingOpt,
    inherited_count: documents.filter((d) => d.inherited).length,
    reusable_from_base: reusable,
    registry,
  };
}

/**
 * Format document review as compact text for Telegram.
 */
export function formatDocumentReview(summary: DocumentReviewSummary): string {
  const lines: string[] = [];

  lines.push(`📁 Документы: ${summary.total_documents} шт. (${summary.required_present}/${summary.required_total} обяз.)"`);

  if (summary.inherited_count > 0) {
    lines.push(`  ✅ Унаследовано: ${summary.inherited_count}`);
  }

  if (summary.pending_names > 0) {
    lines.push(`  📝 Ждут подтверждения имени: ${summary.pending_names}`);
  }

  if (summary.missing_required.length > 0) {
    const labels = summary.missing_required.map((r) => r.requirement.label);
    lines.push(`  ❌ Не хватает: ${labels.join(", ")}`);
  }

  if (summary.missing_conditional.length > 0) {
    const labels = summary.missing_conditional.map((r) => r.requirement.label);
    lines.push(`  ⚠ Условно: ${labels.join(", ")}`);
  }

  if (summary.reusable_from_base.length > 0) {
    lines.push(`  📦 В базе есть: ${summary.reusable_from_base.length} док.`);
  }

  return lines.join("\n");
}
