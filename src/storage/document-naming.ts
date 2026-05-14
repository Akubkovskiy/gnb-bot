/**
 * Storage document naming — canonical file names for placed documents.
 *
 * Naming convention (mirrors act naming style — easily findable):
 *
 * Паспорта (02. Паспорта/):
 *   Паспорт трубы №[N] [марка][.ext]          — pipe passport
 *   Паспорт бентонита №[N] [марка][.ext]      — bentonite passport
 *   Паспорт [материал] №[N][.ext]             — any other material
 *
 * Сертификаты (03. Сертификаты/):
 *   Сертификат [номер][.ext]
 *
 * Приказы (04. Приказы/):
 *   Приказ №[N] [Фамилия] [дата][.ext]
 *   Распоряжение №[N] от [дата][.ext]
 *
 * Исполнительные схемы (05. Исполнительные схемы/):
 *   ИС ГНБ [номер][.ext]
 *
 * Исполнительная документация (01. Исполнительная документация/):
 *   АОСР ОЭК-ГНБ [номер][.ext]
 *   ПБ ГНБ [номер][.ext]        — протокол бурения
 *   АКТ [описание][.ext]
 */

import path from "node:path";

export interface StorageNamingMetadata {
  /** Doc number (e.g. passport number, certificate number). */
  docNumber?: string;
  /** Doc date (e.g. "14.10.2024"). */
  docDate?: string;
  /** Material mark / brand (e.g. "ЭЛЕКТРОПАЙП 225"). */
  mark?: string;
  /** Material type for passport ("трубы" | "бентонита" | "раствора" | ...) */
  materialType?: string;
  /** Person surname for orders. */
  surname?: string;
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
    // ── Паспорта (02. Паспорта/) ──────────────────────────────────────────────
    case "passport_pipe":
    case "pipe_passport": {
      const matType = metadata.materialType || "трубы";
      const num = metadata.docNumber ? ` №${metadata.docNumber}` : "";
      const mark = metadata.mark ? ` ${metadata.mark}` : "";
      return `Паспорт ${matType}${num}${mark}${ext}`;
    }

    case "passport_bentonite":
    case "bentonite_passport": {
      const num = metadata.docNumber ? ` №${metadata.docNumber}` : "";
      const mark = metadata.mark ? ` ${metadata.mark}` : "";
      return `Паспорт бентонита${num}${mark}${ext}`;
    }

    // ── Сертификаты (03. Сертификаты/) ───────────────────────────────────────
    case "certificate":
    case "pipe_certificate": {
      const num = metadata.docNumber ? ` ${metadata.docNumber}` : "";
      return `Сертификат${num}${ext}`;
    }

    // ── Приказы (04. Приказы/) ────────────────────────────────────────────────
    case "order":
    case "order_sign1":
    case "order_sign2":
    case "order_sign3":
    case "order_tech": {
      const num = metadata.docNumber ? `№${metadata.docNumber}` : "";
      const surname = metadata.surname || "";
      const date = metadata.docDate ? `от ${metadata.docDate}` : "";
      const parts = ["Приказ", num, surname, date].filter(Boolean);
      return `${parts.join(" ")}${ext}`;
    }

    case "appointment_letter": {
      const num = metadata.docNumber ? `№${metadata.docNumber}` : "";
      const date = metadata.docDate ? `от ${metadata.docDate}` : "";
      const parts = ["Распоряжение", num, date].filter(Boolean);
      return `${parts.join(" ")}${ext}`;
    }

    // ── Исполнительные схемы (05. Исполнительные схемы/) ─────────────────────
    case "executive_scheme": {
      const gnb = metadata.gnbNumberShort || "";
      return gnb ? `ИС ГНБ ${gnb}${ext}` : `ИС ГНБ${ext}`;
    }

    // ── Исполнительная документация (01. Исполнительная документация/) ────────
    case "drilling_protocol": {
      const gnb = metadata.gnbNumberShort || "";
      return gnb ? `ПБ ГНБ ${gnb}${ext}` : `Протокол бурения${ext}`;
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
      // Keep original name — better than "Документ.pdf"
      return metadata.originalExt ? `Документ${ext}` : `Документ${ext}`;
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
