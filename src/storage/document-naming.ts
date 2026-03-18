/**
 * Storage document naming — canonical file names for placed documents.
 *
 * From CLAUDE.md naming table:
 * - Паспорт качества: `Паспорт качества №[N] [марка].pdf`
 * - Сертификат: `Сертификат соответствия [номер].pdf`
 * - Распоряжение: `Распоряжение ТН №[N] от [дата].pdf`
 * - ИС: `ИС ГНБ [номер].pdf`
 * - Акты: `[N] Акты ЗП ГНБ [номер].xlsx`
 * - АОСР: `[N] АОСР ОЭК-ГНБ [номер].xlsx`
 */

import path from "node:path";

export interface StorageNamingMetadata {
  /** Doc number (e.g. passport number, certificate number). */
  docNumber?: string;
  /** Doc date (e.g. "14.10.2024"). */
  docDate?: string;
  /** Material mark / brand (e.g. "ЭЛЕКТРОПАЙП 225"). */
  mark?: string;
  /** GNB number short (e.g. "5-5"). */
  gnbNumberShort?: string;
  /** Sequential number of transition on this object. */
  sequentialNumber?: number;
  /** Original file extension. */
  originalExt?: string;
}

/**
 * Build a canonical storage file name for a document type.
 * Returns the file name with extension.
 */
export function buildStorageFileName(
  docType: string,
  metadata: StorageNamingMetadata,
): string {
  const ext = metadata.originalExt || ".pdf";

  switch (docType) {
    case "passport_pipe":
    case "pipe_passport": {
      const num = metadata.docNumber ? `№${metadata.docNumber}` : "";
      const mark = metadata.mark || "";
      const parts = ["Паспорт качества", num, mark].filter(Boolean);
      return `${parts.join(" ")}${ext}`;
    }

    case "certificate":
    case "pipe_certificate": {
      const num = metadata.docNumber || "";
      return num
        ? `Сертификат соответствия ${num}${ext}`
        : `Сертификат соответствия${ext}`;
    }

    case "order":
    case "order_tech":
    case "appointment_letter": {
      const num = metadata.docNumber ? `№${metadata.docNumber}` : "";
      const date = metadata.docDate ? `от ${metadata.docDate}` : "";
      const parts = ["Распоряжение ТН", num, date].filter(Boolean);
      return `${parts.join(" ")}${ext}`;
    }

    case "executive_scheme": {
      const gnb = metadata.gnbNumberShort || "";
      return gnb ? `ИС ГНБ ${gnb}${ext}` : `ИС ГНБ${ext}`;
    }

    case "generated_internal_acts":
    case "prior_internal_act": {
      const seq = metadata.sequentialNumber ?? "";
      const gnb = metadata.gnbNumberShort || "";
      const parts = [seq, `Акты ЗП ГНБ ${gnb}`].filter(Boolean);
      return `${parts.join(" ").trim()}.xlsx`;
    }

    case "generated_aosr":
    case "prior_aosr": {
      const seq = metadata.sequentialNumber ?? "";
      const gnb = metadata.gnbNumberShort || "";
      const parts = [seq, `АОСР ОЭК-ГНБ ${gnb}`].filter(Boolean);
      return `${parts.join(" ").trim()}.xlsx`;
    }

    case "summary_excel": {
      return `Сводка${ext === ".pdf" ? ".xlsx" : ext}`;
    }

    default: {
      // For unknown types, keep original name or generate generic
      return `Документ${ext}`;
    }
  }
}

/**
 * Get file extension from a filename.
 */
export function extractExtension(filename?: string): string {
  if (!filename) return ".pdf";
  const ext = path.extname(filename);
  return ext || ".pdf";
}
