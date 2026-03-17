/**
 * Document registry builder — converts intake sources + extractions
 * into a structured document registry for a GNB transition.
 */

import type { IntakeDraft, SourceDocument, DocClass } from "./intake-types.js";
import type { Transition } from "../domain/types.js";
import type {
  RegistryDocument,
  DocumentKind,
  DocumentRegistry,
} from "./document-registry-types.js";
import { buildNameProposal } from "./naming.js";
import { evaluateDocumentCoverage } from "./document-requirements.js";

// === DocClass → DocumentKind mapping ===

function docClassToKind(docClass: DocClass, relatedEntity?: string): DocumentKind {
  switch (docClass) {
    case "executive_scheme": return "executive_scheme";
    case "passport_pipe": return "pipe_passport";
    case "certificate": return "pipe_certificate";
    case "order":
    case "appointment_letter": return "appointment_letter";
    case "prior_internal_act": return "prior_internal_act";
    case "prior_aosr": return "prior_aosr";
    case "summary_excel": return "summary_excel";
    case "photo_of_doc": return "photo";
    case "free_text_note": return "free_text_note";
    default: return "other";
  }
}

/** Refine kind based on material subtype or related entity. */
function refineMaterialKind(kind: DocumentKind, relatedEntity?: string): DocumentKind {
  if (!relatedEntity) return kind;
  const lower = relatedEntity.toLowerCase();
  if (/бентонит/i.test(lower)) return "bentonite_passport";
  if (/укпт|уплотнител/i.test(lower)) return "ukpt_doc";
  if (/заглушк/i.test(lower)) return "plugs_doc";
  if (/шнур|кабел/i.test(lower)) return "cord_doc";
  return kind;
}

// === Registry builder ===

/**
 * Build a document registry from an intake draft's sources.
 */
export function buildDocumentRegistry(draft: IntakeDraft): DocumentRegistry {
  const documents: RegistryDocument[] = [];

  for (const source of draft.sources) {
    // Skip free-text notes — only real files count as registry documents
    if (source.doc_class === "free_text_note") continue;
    const doc = deriveRegistryDocument(source, draft);
    documents.push(doc);
  }

  const requirements = evaluateDocumentCoverage(documents);

  return { documents, requirements };
}

/**
 * Derive a registry document from a source document + draft context.
 */
export function deriveRegistryDocument(
  source: SourceDocument,
  draft: IntakeDraft,
): RegistryDocument {
  // Find extraction result for this source
  const extractedFields = draft.fields.filter((f) => f.source_id === source.source_id);

  // Determine kind
  let kind = docClassToKind(source.doc_class, source.short_summary);
  kind = refineMaterialKind(kind, source.short_summary);

  // Extract doc_number/doc_date from fields if available
  let docNumber: string | undefined;
  let docDate: string | undefined;
  // These might be in the extraction summary
  if (source.short_summary) {
    const numMatch = source.short_summary.match(/№\s*(\S+)/);
    if (numMatch) docNumber = numMatch[1];
    const dateMatch = source.short_summary.match(/от\s*(\d{2}\.\d{2}\.\d{4})/);
    if (dateMatch) docDate = dateMatch[1];
  }

  const doc: RegistryDocument = {
    doc_id: `reg-${source.source_id}`,
    source_id: source.source_id,
    original_file_name: source.original_file_name,
    kind,
    doc_class: source.doc_class,
    doc_number: docNumber,
    doc_date: docDate,
    summary: source.short_summary,
    confidence: extractedFields.length > 0 ? "high" : "low",
    source_type: source.source_type,
    received_at: source.received_at,
    inherited: source.source_type === "prior_act",
    base_transition_id: source.source_type === "prior_act" ? draft.base_transition_id : undefined,
    status: "detected",
  };

  // Auto-generate name proposal
  doc.name_proposal = buildNameProposal(doc);

  return doc;
}

// === Base document reuse ===

export interface ReusableDoc {
  kind: DocumentKind;
  label: string;
  source: string; // e.g. "ЗП № 3"
  details?: string;
}

/**
 * Get reusable documents from a base transition.
 */
export function getReusableBaseDocuments(base: Transition): ReusableDoc[] {
  const docs: ReusableDoc[] = [];
  const src = base.gnb_number || base.id;

  // Pipe
  if (base.pipe?.mark) {
    docs.push({
      kind: "pipe_passport",
      label: `Труба: ${base.pipe.mark}`,
      source: src,
      details: base.pipe.quality_passport,
    });
  }

  // Signatories (their orders/appointments)
  if (base.signatories?.sign1_customer) {
    docs.push({
      kind: "order_sign1",
      label: `Мастер РЭС: ${base.signatories.sign1_customer.full_name}`,
      source: src,
    });
  }
  if (base.signatories?.sign2_contractor) {
    docs.push({
      kind: "order_sign2",
      label: `Подрядчик: ${base.signatories.sign2_contractor.full_name}`,
      source: src,
    });
  }
  if (base.signatories?.sign3_optional) {
    docs.push({
      kind: "order_sign3",
      label: `Субподрядчик: ${base.signatories.sign3_optional.full_name}`,
      source: src,
    });
  }
  if (base.signatories?.tech_supervisor) {
    docs.push({
      kind: "order_tech",
      label: `Технадзор: ${base.signatories.tech_supervisor.full_name}`,
      source: src,
    });
  }

  // Materials
  if (base.materials?.ukpt) {
    docs.push({ kind: "ukpt_doc", label: "УКПТ", source: src });
  }
  if (base.materials?.plugs) {
    docs.push({ kind: "plugs_doc", label: "Заглушки", source: src });
  }
  if (base.materials?.cord) {
    docs.push({ kind: "cord_doc", label: "Шнур", source: src });
  }

  return docs;
}

/**
 * Get reusable pipe documents from base.
 */
export function getReusablePipeDocs(base: Transition): ReusableDoc[] {
  return getReusableBaseDocuments(base).filter(
    (d) => d.kind === "pipe_passport" || d.kind === "pipe_certificate",
  );
}

/**
 * Get reusable material documents from base.
 */
export function getReusableMaterialDocs(base: Transition): ReusableDoc[] {
  return getReusableBaseDocuments(base).filter(
    (d) => ["bentonite_passport", "ukpt_doc", "plugs_doc", "cord_doc"].includes(d.kind),
  );
}

/**
 * Get reusable signatory documents from base.
 */
export function getReusableSignatoryDocs(base: Transition): ReusableDoc[] {
  return getReusableBaseDocuments(base).filter(
    (d) => ["order_sign1", "order_sign2", "order_sign3", "order_tech", "appointment_letter"].includes(d.kind),
  );
}
