/**
 * Document classifier — determines doc_class from filename, extension, and content hints.
 *
 * Pure function, no external dependencies.
 * For PDF/photo OCR text, call classifyText() after extraction.
 * For files, call classifyByFilename() first, then refine with classifyText().
 */

import type { DocClass, SourceType } from "./intake-types.js";

export interface ClassifyResult {
  doc_class: DocClass;
  confidence: "high" | "medium" | "low";
  hints: string[]; // what matched
}

// === Filename-based classification ===

export function classifyByFilename(filename: string): ClassifyResult {
  const lower = filename.toLowerCase();
  const ext = lower.split(".").pop() ?? "";

  // Excel → likely prior act or summary
  if (ext === "xls" || ext === "xlsx") {
    if (lower.includes("акт") && lower.includes("гнб")) {
      return { doc_class: "prior_internal_act", confidence: "high", hints: ["filename: акт + гнб + excel"] };
    }
    if (lower.includes("аоср")) {
      return { doc_class: "prior_aosr", confidence: "high", hints: ["filename: аоср + excel"] };
    }
    return { doc_class: "summary_excel", confidence: "medium", hints: ["excel file"] };
  }

  // PDF classification by filename
  if (ext === "pdf") {
    if (lower.includes("паспорт") && (lower.includes("труб") || lower.includes("качеств"))) {
      return { doc_class: "passport_pipe", confidence: "high", hints: ["filename: паспорт + труб/качеств"] };
    }
    if (lower.includes("сертификат") || lower.includes("декларация")) {
      return { doc_class: "certificate", confidence: "high", hints: ["filename: сертификат/декларация"] };
    }
    if (lower.includes("приказ") || lower.includes("распоряжение")) {
      return { doc_class: "order", confidence: "high", hints: ["filename: приказ/распоряжение"] };
    }
    if (lower.includes("назначен")) {
      return { doc_class: "appointment_letter", confidence: "high", hints: ["filename: назначен"] };
    }
    if (lower.includes("схема") || lower.includes("профиль") || lower.includes("чертёж") || lower.includes("чертеж")
      || /(?:^|\s)ис(?:\s|$)/.test(lower) || lower.includes("исполнительн")) {
      return { doc_class: "executive_scheme", confidence: "high", hints: ["filename: ис/схема/профиль/чертёж"] };
    }
    if (lower.includes("аоср")) {
      return { doc_class: "prior_aosr", confidence: "high", hints: ["filename: аоср"] };
    }
    if (lower.includes("акт") && lower.includes("гнб")) {
      return { doc_class: "prior_internal_act", confidence: "high", hints: ["filename: акт + гнб"] };
    }
    return { doc_class: "unknown", confidence: "low", hints: ["pdf, no filename match"] };
  }

  // Photo
  if (["jpg", "jpeg", "png", "heic", "webp"].includes(ext)) {
    return { doc_class: "photo_of_doc", confidence: "medium", hints: ["image file"] };
  }

  return { doc_class: "unknown", confidence: "low", hints: ["unrecognized extension: " + ext] };
}

// === Text content-based classification ===

const TEXT_PATTERNS: Array<{ pattern: RegExp; doc_class: DocClass; hint: string }> = [
  // Passport pipe
  { pattern: /паспорт\s*(качества|на\s*трубу|трубы)/i, doc_class: "passport_pipe", hint: "text: паспорт качества/трубы" },
  { pattern: /SDR\s*\d|ЭЛЕКТРОПАЙП|ПЭ\s*100|полиэтилен/i, doc_class: "passport_pipe", hint: "text: pipe material markers" },

  // Certificate
  { pattern: /СЕРТИФИКАТ\s*СООТВЕТСТВИЯ/i, doc_class: "certificate", hint: "text: сертификат соответствия" },
  { pattern: /ДЕКЛАРАЦИЯ\s*О\s*СООТВЕТСТВИИ/i, doc_class: "certificate", hint: "text: декларация о соответствии" },

  // Order / appointment
  { pattern: /ПРИКАЗ\s*№?\s*\d/i, doc_class: "order", hint: "text: приказ №" },
  { pattern: /РАСПОРЯЖЕНИЕ\s*№?\s*\d/i, doc_class: "order", hint: "text: распоряжение №" },
  { pattern: /о\s*назначении\s*(лица|ответственн)/i, doc_class: "appointment_letter", hint: "text: о назначении" },
  { pattern: /НРС.*[A-Z]-\d{2}-\d{6}/i, doc_class: "appointment_letter", hint: "text: НРС номер" },

  // Executive scheme
  { pattern: /исполнительная\s*схема/i, doc_class: "executive_scheme", hint: "text: исполнительная схема" },
  { pattern: /исполнительный\s*чертёж|исполнительный\s*чертеж/i, doc_class: "executive_scheme", hint: "text: исполнительный чертёж" },
  { pattern: /план\s*трассы|профиль\s*перехода/i, doc_class: "executive_scheme", hint: "text: план трассы / профиль перехода" },
  { pattern: /масштаб\s*\d+:\d+/i, doc_class: "executive_scheme", hint: "text: масштаб" },
  { pattern: /L\s*(?:пл|проф)|длина\s*(?:плановая|профильная)/i, doc_class: "executive_scheme", hint: "text: L пл/проф" },

  // Prior AOSR
  { pattern: /АКТ\s*ОСВИДЕТЕЛЬСТВОВАНИЯ\s*СКРЫТЫХ/i, doc_class: "prior_aosr", hint: "text: акт освидетельствования скрытых работ" },
  { pattern: /приказ\s*минстроя.*344/i, doc_class: "prior_aosr", hint: "text: приказ минстроя 344" },

  // Prior internal act
  { pattern: /АКТ\s*(?:ПРИЁМКИ|ПРИЕМКИ|ГЕРМЕТИЗАЦИИ|СВАРКИ|ОСВИДЕТЕЛЬСТВОВАНИЯ)/i, doc_class: "prior_internal_act", hint: "text: акт приемки/герметизации/сварки" },
  { pattern: /ВНУТРЕНН\w*\s*АКТ/i, doc_class: "prior_internal_act", hint: "text: внутренний акт" },
];

export function classifyText(text: string): ClassifyResult {
  const matches: Array<{ doc_class: DocClass; hint: string }> = [];

  for (const { pattern, doc_class, hint } of TEXT_PATTERNS) {
    if (pattern.test(text)) {
      matches.push({ doc_class, hint });
    }
  }

  if (matches.length === 0) {
    return { doc_class: "unknown", confidence: "low", hints: ["no text patterns matched"] };
  }

  // Count by doc_class — most matches wins
  const counts = new Map<DocClass, number>();
  const hints: string[] = [];
  for (const m of matches) {
    counts.set(m.doc_class, (counts.get(m.doc_class) || 0) + 1);
    hints.push(m.hint);
  }

  let bestClass: DocClass = "unknown";
  let bestCount = 0;
  for (const [cls, count] of counts) {
    if (count > bestCount) {
      bestClass = cls;
      bestCount = count;
    }
  }

  const confidence = bestCount >= 2 ? "high" : "medium";
  return { doc_class: bestClass, confidence, hints };
}

/**
 * Combined classification: filename first, then refine with text content.
 * Text result wins if filename was uncertain.
 */
export function classify(filename: string | undefined, text: string | undefined): ClassifyResult {
  const byFile = filename ? classifyByFilename(filename) : null;
  const byText = text ? classifyText(text) : null;

  // Both available — text wins if filename was low confidence
  if (byFile && byText) {
    if (byFile.confidence === "high") return byFile;
    if (byText.confidence !== "low") {
      return {
        doc_class: byText.doc_class,
        confidence: byText.confidence,
        hints: [...byFile.hints, ...byText.hints],
      };
    }
    return byFile;
  }

  if (byFile) return byFile;
  if (byText) return byText;

  return { doc_class: "unknown", confidence: "low", hints: ["no filename or text"] };
}

/**
 * Determine source_type from file extension.
 */
export function sourceTypeFromExt(filename: string): SourceType {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf") return "pdf";
  if (["jpg", "jpeg", "png", "heic", "webp"].includes(ext)) return "photo";
  if (["xls", "xlsx"].includes(ext)) return "excel";
  return "pdf"; // fallback
}
