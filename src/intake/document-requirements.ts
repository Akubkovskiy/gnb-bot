/**
 * Document requirements matrix for OEK GNB packages.
 *
 * Defines which documents are required/conditional/optional
 * for a complete transition package.
 */

import type {
  DocumentRequirement,
  RequirementCheck,
  RequirementStatus,
  RequirementLevel,
  DocumentKind,
  RegistryDocument,
} from "./document-registry-types.js";

// === OEK GNB document requirements ===

export const OEK_REQUIREMENTS: DocumentRequirement[] = [
  // Required
  { kind: "executive_scheme", label: "Исполнительная схема (ИС)", level: "required" },
  { kind: "pipe_passport", label: "Паспорт качества трубы", level: "required" },
  { kind: "generated_internal_acts", label: "Внутренние акты ГНБ", level: "required" },
  { kind: "generated_aosr", label: "АОСР", level: "required" },

  // Conditional
  { kind: "pipe_certificate", label: "Сертификат трубы", level: "conditional", condition: "если есть" },
  { kind: "order_sign2", label: "Приказ/НРС подрядчика", level: "conditional", condition: "если sign2 изменился" },
  { kind: "order_tech", label: "Распоряжение технадзора", level: "conditional", condition: "если ТН изменился" },
  { kind: "order_sign3", label: "Приказ субподрядчика", level: "conditional", condition: "если sign3 есть" },

  // Optional materials
  { kind: "bentonite_passport", label: "Паспорт бентонита", level: "optional" },
  { kind: "ukpt_doc", label: "Документ УКПТ", level: "optional" },
  { kind: "plugs_doc", label: "Документ на заглушки", level: "optional" },
  { kind: "cord_doc", label: "Документ на шнур", level: "optional" },
];

/**
 * Evaluate document coverage against requirements.
 */
export function evaluateDocumentCoverage(
  docs: RegistryDocument[],
  requirements?: DocumentRequirement[],
): RequirementCheck[] {
  const reqs = requirements ?? OEK_REQUIREMENTS;
  const checks: RequirementCheck[] = [];

  for (const req of reqs) {
    const match = docs.find((d) => d.kind === req.kind && d.status !== "rejected" && d.status !== "superseded");

    let status: RequirementStatus;
    if (match) {
      status = match.inherited ? "inherited" : "present";
    } else {
      status = "missing";
    }

    checks.push({
      requirement: req,
      status,
      doc_id: match?.doc_id,
    });
  }

  return checks;
}

/**
 * Get missing required documents.
 */
export function getMissingRequired(checks: RequirementCheck[]): RequirementCheck[] {
  return checks.filter((c) => c.status === "missing" && c.requirement.level === "required");
}

/**
 * Get missing conditional documents.
 */
export function getMissingConditional(checks: RequirementCheck[]): RequirementCheck[] {
  return checks.filter((c) => c.status === "missing" && c.requirement.level === "conditional");
}

/**
 * Get missing optional documents.
 */
export function getMissingOptional(checks: RequirementCheck[]): RequirementCheck[] {
  return checks.filter((c) => c.status === "missing" && c.requirement.level === "optional");
}

/**
 * Check if all required documents are present.
 */
export function allRequiredPresent(checks: RequirementCheck[]): boolean {
  return getMissingRequired(checks).length === 0;
}
