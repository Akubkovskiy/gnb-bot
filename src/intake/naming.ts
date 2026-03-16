/**
 * Naming proposal engine — suggests canonical filenames for GNB documents.
 *
 * Rules:
 * - Never invent missing metadata (numbers, dates)
 * - Incomplete proposals marked as such
 * - Owner must approve before name is finalized
 */

import type { RegistryDocument, NameProposal, DocumentKind } from "./document-registry-types.js";

const KIND_LABELS: Record<DocumentKind, string> = {
  executive_scheme: "ИС ГНБ",
  pipe_passport: "Паспорт трубы",
  pipe_certificate: "Сертификат трубы",
  bentonite_passport: "Паспорт Бентонит",
  ukpt_doc: "УКПТ",
  plugs_doc: "Заглушки",
  cord_doc: "Шнур",
  order_sign1: "Приказ мастер",
  order_sign2: "Приказ подрядчик",
  order_sign3: "Приказ субподрядчик",
  order_tech: "Распоряжение ТН",
  appointment_letter: "Назначение",
  prior_internal_act: "Акты ЗП ГНБ",
  prior_aosr: "АОСР",
  summary_excel: "Сводка",
  photo: "Фото",
  free_text_note: "Заметка",
  generated_internal_acts: "Акты ЗП ГНБ",
  generated_aosr: "АОСР ОЭК-ГНБ",
  other: "Документ",
};

/**
 * Build a canonical name proposal for a registry document.
 */
export function buildNameProposal(doc: RegistryDocument): NameProposal {
  const label = KIND_LABELS[doc.kind] ?? "Документ";
  const missing: string[] = [];
  const parts: string[] = [label];

  // Add entity info if present
  if (doc.related_entity) {
    parts.push(doc.related_entity);
  }

  // Add doc number
  if (doc.doc_number) {
    parts.push(`№${doc.doc_number}`);
  } else if (needsNumber(doc.kind)) {
    missing.push("номер документа");
  }

  // Add doc date
  if (doc.doc_date) {
    parts.push(`от ${doc.doc_date}`);
  } else if (needsDate(doc.kind)) {
    missing.push("дата документа");
  }

  const ext = getExtension(doc.original_file_name);
  const name = parts.join(" ") + ext;
  const complete = missing.length === 0;

  return {
    suggested_name: name,
    complete,
    missing_parts: missing,
    proposed_at: new Date().toISOString(),
  };
}

/**
 * Suggest a canonical name (convenience wrapper).
 */
export function suggestCanonicalName(doc: RegistryDocument): string {
  return buildNameProposal(doc).suggested_name;
}

/**
 * Validate a name proposal — check it's not empty and has extension.
 */
export function validateNameProposal(name: string): { valid: boolean; reason?: string } {
  if (!name || name.trim().length < 3) {
    return { valid: false, reason: "Имя слишком короткое" };
  }
  if (!name.includes(".")) {
    return { valid: false, reason: "Нет расширения файла" };
  }
  // Check for dangerous characters
  if (/[<>:"|?*]/.test(name)) {
    return { valid: false, reason: "Недопустимые символы в имени" };
  }
  return { valid: true };
}

/**
 * Apply approved name to a registry document (returns updated doc).
 */
export function applyApprovedName(doc: RegistryDocument, approvedName: string): RegistryDocument {
  return {
    ...doc,
    approved_name: approvedName,
    status: "approved",
  };
}

// === Helpers ===

function needsNumber(kind: DocumentKind): boolean {
  return [
    "pipe_passport", "pipe_certificate", "bentonite_passport",
    "ukpt_doc", "plugs_doc", "cord_doc",
    "order_sign1", "order_sign2", "order_sign3", "order_tech",
    "appointment_letter",
  ].includes(kind);
}

function needsDate(kind: DocumentKind): boolean {
  return needsNumber(kind); // same set needs dates
}

function getExtension(filename?: string): string {
  if (!filename) return ".pdf";
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot) : ".pdf";
}
