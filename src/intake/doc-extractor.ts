/**
 * Document extraction pipeline.
 *
 * file → classify → build prompt → Claude extraction → normalize → ExtractionResult
 *
 * External dependency: askClaude() from claude.ts (injected for testability).
 * All other logic is pure functions.
 */

import path from "node:path";
import { logger } from "../logger.js";
import type {
  ExtractionResult,
  ExtractionField,
  ExtractionAmbiguity,
  RawExtractionPair,
  MaterialSubtype,
} from "./extraction-types.js";
import type { DocClass, FieldConfidence, SourceType, ExtractedField, FieldName } from "./intake-types.js";
import { classify, classifyByFilename, classifyText, sourceTypeFromExt } from "./doc-classifier.js";
import { parseDate } from "../domain/formatters.js";

// === Types for injection ===

/** Claude caller signature — injected for testability. */
export type ClaudeCaller = (prompt: string, opts?: { files?: string[] }) => Promise<string>;

// === Main pipeline ===

/**
 * Full extraction pipeline: classify + extract via Claude + normalize.
 *
 * @param filePath - absolute path to the document
 * @param callClaude - injected Claude caller (use askClaude in prod)
 * @returns ExtractionResult with fields, warnings, ambiguities
 */
export async function extractDocument(
  filePath: string,
  callClaude: ClaudeCaller,
): Promise<ExtractionResult> {
  const filename = path.basename(filePath);
  const sourceType = sourceTypeFromExt(filename);

  // Step 1: classify by filename
  const fileClass = classifyByFilename(filename);
  let docClass = fileClass.doc_class;
  let materialSubtype: MaterialSubtype | undefined;

  // Step 2: detect material subtype from filename
  materialSubtype = detectMaterialSubtype(filename);

  // Step 3: build extraction prompt (may be generic if filename is unclear)
  const prompt = buildExtractionPrompt(docClass, filePath, materialSubtype);

  // Step 4: call Claude
  let rawResponse: string;
  try {
    rawResponse = await callClaude(prompt, { files: [filePath] });
  } catch (err) {
    return {
      doc_class: docClass,
      material_subtype: materialSubtype,
      summary: `Ошибка извлечения: ${err instanceof Error ? err.message : "unknown"}`,
      raw_response: "",
      fields: [],
      warnings: [`Claude extraction failed: ${err instanceof Error ? err.message : "unknown"}`],
      ambiguities: [],
      confidence: "low",
      source_type: sourceType,
    };
  }

  // Step 5: refine classification from text if filename was uncertain or generic
  // Photos and unknown always need text-based refinement
  let reclassified = false;
  const needsRefinement = fileClass.confidence === "low"
    || docClass === "photo_of_doc"
    || docClass === "unknown";
  if (needsRefinement) {
    const textClass = classifyText(rawResponse);
    if (textClass.confidence !== "low" && textClass.doc_class !== docClass) {
      docClass = textClass.doc_class;
      reclassified = true;
    }
  }

  // Step 6: detect material subtype from content if not from filename
  if (!materialSubtype) {
    materialSubtype = detectMaterialSubtypeFromText(rawResponse);
  }

  // Step 7: if reclassified to a specific type, re-extract with targeted prompt
  // This ensures executive_scheme/passport_pipe/etc get proper field extraction
  if (reclassified && docClass !== "unknown") {
    const refinedPrompt = buildExtractionPrompt(docClass, filePath, materialSubtype);
    try {
      rawResponse = await callClaude(refinedPrompt, { files: [filePath] });
    } catch {
      // Fall through with original response — better than nothing
    }
  }

  // Step 8: normalize
  logger.info({ docClass, reclassified, responseLen: rawResponse.length, responsePreview: rawResponse.slice(0, 300) }, "Claude extraction result");
  const result = normalizeExtraction(rawResponse, docClass, sourceType, materialSubtype);
  logger.info({ docClass, fieldsCount: result.fields.length, warnings: result.warnings }, "Normalized extraction");
  return result;
}

// === Prompt builder ===

/**
 * Build extraction prompt for Claude based on doc_class.
 */
export function buildExtractionPrompt(
  docClass: DocClass,
  filePath: string,
  materialSubtype?: MaterialSubtype,
): string {
  const absPath = path.resolve(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const isExcel = ext === ".xls" || ext === ".xlsx";
  const fileHint = isExcel
    ? `Прочитай Excel файл ${absPath}. Используй инструмент Read или Bash (python/openpyxl) чтобы прочитать содержимое.\n\n`
    : `Прочитай файл ${absPath} и извлеки данные.\n\n`;
  const base = fileHint;

  const rules = `ПРАВИЛА:
- Извлекай ТОЛЬКО то, что явно написано в документе.
- НЕ додумывай номера, даты, ФИО, адреса, шифры, НРС.
- Если значение не найдено — напиши "не найдено".
- Если значение нечёткое — добавь "(?)".
- Формат ответа: СТРОГО каждое поле на новой строке "КЛЮЧ: значение". Без markdown заголовков, без таблиц.\n\n`;

  switch (docClass) {
    case "executive_scheme":
      return base + rules + `Тип документа: исполнительная схема / чертёж ГНБ.
Извлеки:
НОМЕР_ГНБ: номер перехода (например "ЗП № 5-5")
ОБЪЕКТ: название объекта/стройки
АДРЕС: адрес
ШИФР_ПРОЕКТА: шифр/номер проекта
ЗАГОЛОВОК: наименование объекта из штампа
L_ПЛАН: длина плановая (метры)
L_ПРОФИЛЬ: длина профильная (метры)
ДИАМЕТР_ТРУБЫ: диаметр трубы (мм)
КОЛ_ТРУБ: количество труб
ДИАМЕТР_СКВАЖИНЫ: диаметр скважины (мм)
КОНФИГУРАЦИЯ: конфигурация перехода
ЗАКАЗЧИК: заказчик, если указан`;

    case "passport_pipe":
      return base + rules + `Тип документа: паспорт качества / паспорт на трубу.
Извлеки:
НОМЕР_ДОКУМЕНТА: номер паспорта
ДАТА_ДОКУМЕНТА: дата паспорта
МАРКА_ТРУБЫ: полное условное обозначение трубы
ДИАМЕТР: диаметр (мм)
ПАРТИЯ: номер партии, если есть
ПРОИЗВОДИТЕЛЬ: производитель, если указан`;

    case "certificate":
      return base + rules + `Тип документа: сертификат соответствия / декларация.
Извлеки:
НОМЕР_ДОКУМЕНТА: номер сертификата/декларации
ДАТА_ДОКУМЕНТА: дата выдачи
СРОК_ДЕЙСТВИЯ: срок действия (до)
ПРОДУКЦИЯ: на что выдан
ОРГАН: кем выдан, если указан`;

    case "order":
    case "appointment_letter":
      return base + rules + `Тип документа: приказ / распоряжение / назначение.
Извлеки:
ФИО: полные ФИО назначенного лица (Фамилия И.О.)
ДОЛЖНОСТЬ: должность
ОРГАНИЗАЦИЯ: организация
ТИП_ДОКУМЕНТА: приказ / распоряжение
НОМЕР_ДОКУМЕНТА: номер
ДАТА_ДОКУМЕНТА: дата
НРС_НОМЕР: идентификационный номер в НРС (если есть)
НРС_ДАТА: дата НРС (если есть)
РОЛЬ: роль подписанта (технадзор / мастер / подрядчик / субподрядчик), если явно понятна`;

    case "prior_aosr":
    case "prior_internal_act":
    case "summary_excel":
      return base + rules + `Тип документа: ранее подготовленный акт ГНБ / АОСР / Excel с данными перехода.
Это Excel/PDF с данными существующего ГНБ-перехода. Прочитай ВСЕ листы и извлеки:
НОМЕР_ГНБ: номер перехода (например "ЗП № 5-5")
ЗАГОЛОВОК: наименование объекта / title line
ОБЪЕКТ: название стройки / объекта
АДРЕС: адрес работ
ЗАКАЗЧИК: организация-заказчик (полное название)
ПОДРЯДЧИК: организация-подрядчик (полное название)
ПРОЕКТИРОВЩИК: проектная организация
ИСПОЛНИТЕЛЬ: исполнитель работ
ШИФР_ПРОЕКТА: шифр/номер проекта
ДАТА_НАЧАЛА: дата начала работ
ДАТА_ОКОНЧАНИЯ: дата окончания работ
ПОДПИСАНТ_1: представитель заказчика / мастер РЭС — ФИО, должность, организация
ПОДПИСАНТ_2: подрядчик — ФИО, должность, организация, НРС, приказ
ПОДПИСАНТ_3: субподрядчик — ФИО, должность, организация, приказ (если есть)
ПОДПИСАНТ_ТН: технадзор — ФИО, должность, организация, НРС, распоряжение
МАРКА_ТРУБЫ: марка/тип трубы
L_ПЛАН: длина плановая (метры)
L_ПРОФИЛЬ: длина профильная (метры)
КОЛ_ТРУБ: количество труб
ДИАМЕТР_СКВАЖИНЫ: диаметр скважины (мм)
КОНФИГУРАЦИЯ: конфигурация перехода`;

    default:
      // For photo_of_doc, unknown, materials, etc.
      if (materialSubtype && materialSubtype !== "other") {
        return base + rules + `Тип документа: документ на материал (${MATERIAL_LABELS[materialSubtype]}).
Извлеки:
НОМЕР_ДОКУМЕНТА: номер документа
ДАТА_ДОКУМЕНТА: дата
НАЗВАНИЕ_МАТЕРИАЛА: название/марка материала
ТИП_ДОКУМЕНТА: паспорт / сертификат / письмо
ПРОИЗВОДИТЕЛЬ: производитель, если указан
ПАРТИЯ: номер партии, если есть
ПРИМЕЧАНИЕ: любая дополнительная информация`;
      }

      return base + rules + `Определи тип документа и извлеки ВСЕ ключевые данные.
Формат: КЛЮЧ: значение (каждое поле на новой строке).
Начни ответ с ТИП_ДОКУМЕНТА: <тип>.`;
  }
}

// === Normalization ===

/**
 * Normalize raw Claude extraction text into structured ExtractionResult.
 */
export function normalizeExtraction(
  rawResponse: string,
  docClass: DocClass,
  sourceType: SourceType,
  materialSubtype?: MaterialSubtype,
): ExtractionResult {
  const pairs = parseKeyValuePairs(rawResponse);
  const fields: ExtractionField[] = [];
  const warnings: string[] = [];
  const ambiguities: ExtractionAmbiguity[] = [];

  let docNumber: string | undefined;
  let docDate: string | undefined;

  for (const { key, value } of pairs) {
    if (!value || value === "не найдено" || value === "—") {
      warnings.push(`${key}: не найдено`);
      continue;
    }

    const hasQuestion = value.includes("(?)");
    const confidence: FieldConfidence = hasQuestion ? "medium" : "high";
    const cleanValue = value.replace(/\s*\(\?\)\s*/g, "").trim();

    // Track doc number/date
    if (key === "НОМЕР_ДОКУМЕНТА" || key === "НОМЕР_ПАСПОРТА") {
      docNumber = cleanValue;
    }
    if (key === "ДАТА_ДОКУМЕНТА" || key === "ДАТА_ПАСПОРТА") {
      docDate = cleanValue;
    }

    fields.push({
      key: normalizeKey(key),
      value: parseNumericIfPossible(key, cleanValue),
      confidence,
      notes: hasQuestion ? "нечёткое распознавание" : undefined,
    });
  }

  // Check for missing critical fields
  if (docClass === "passport_pipe" && !docNumber) {
    warnings.push("Номер паспорта не найден");
  }
  if (docClass === "certificate" && !docNumber) {
    warnings.push("Номер сертификата не найден");
  }
  if ((docClass === "order" || docClass === "appointment_letter") && !docDate) {
    warnings.push("Дата документа не найдена");
  }

  // Build summary
  const summary = buildSummary(docClass, fields, materialSubtype);

  // Build suggested name parts
  const suggested_name_parts = {
    doc_type_label: DOC_TYPE_LABELS[docClass] ?? docClass,
    number: docNumber,
    date: docDate,
  };

  return {
    doc_class: docClass,
    material_subtype: materialSubtype,
    summary,
    raw_response: rawResponse,
    fields,
    warnings,
    ambiguities,
    doc_number: docNumber,
    doc_date: docDate,
    suggested_name_parts,
    confidence: fields.length > 0 ? overallConfidence(fields) : "low",
    source_type: sourceType,
  };
}

// === Field mapper ===

/**
 * Map ExtractionResult fields to IntakeDraftStore-compatible ExtractedField[].
 *
 * Does NOT update the store — returns candidates for caller to process.
 */
export function mapExtractionToFields(
  result: ExtractionResult,
  sourceId: string,
): ExtractedField[] {
  const mapped: ExtractedField[] = [];

  for (const field of result.fields) {
    const mapping = FIELD_MAPPING[result.doc_class]?.[field.key];
    if (!mapping) continue;

    mapped.push({
      field_name: mapping.fieldName,
      value: mapping.transform ? mapping.transform(field.value) : field.value,
      source_id: sourceId,
      source_type: result.source_type,
      confidence: field.confidence,
      confirmed_by_owner: false,
      conflict_with_existing: false,
      notes: field.notes,
    });
  }

  return mapped;
}

// === Material detection ===

const MATERIAL_KEYWORDS: Record<MaterialSubtype, RegExp> = {
  bentonite: /бентонит/i,
  ukpt: /УКПТ|уплотнител/i,
  plugs: /заглушк/i,
  cord: /шнур|кабел/i,
  other: /$/,
};

const MATERIAL_LABELS: Record<MaterialSubtype, string> = {
  bentonite: "бентонит",
  ukpt: "УКПТ",
  plugs: "заглушки",
  cord: "шнур",
  other: "прочий материал",
};

export function detectMaterialSubtype(filename: string): MaterialSubtype | undefined {
  const lower = filename.toLowerCase();
  for (const [subtype, pattern] of Object.entries(MATERIAL_KEYWORDS)) {
    if (subtype === "other") continue;
    if (pattern.test(lower)) return subtype as MaterialSubtype;
  }
  return undefined;
}

export function detectMaterialSubtypeFromText(text: string): MaterialSubtype | undefined {
  for (const [subtype, pattern] of Object.entries(MATERIAL_KEYWORDS)) {
    if (subtype === "other") continue;
    if (pattern.test(text)) return subtype as MaterialSubtype;
  }
  return undefined;
}

// === Internal helpers ===

/**
 * Parse Claude's key-value response into pairs.
 * Handles: "KEY: value", "KEY = value", "KEY — value"
 */
export function parseKeyValuePairs(text: string): RawExtractionPair[] {
  const pairs: RawExtractionPair[] = [];
  const lines = text.split("\n");

  for (let line of lines) {
    // Strip markdown list markers: "- ", "* ", "• ", "1. "
    line = line.replace(/^\s*[-*•]\s+/, "").replace(/^\s*\d+\.\s+/, "");

    const match = line.match(/^\s*([A-ZА-ЯЁ_][A-ZА-ЯЁa-zа-яё0-9_\s]*?)\s*[:=—]\s*(.+)$/);
    if (match) {
      const key = match[1].trim().toUpperCase().replace(/\s+/g, "_");
      const value = match[2].trim();
      if (key && value) {
        pairs.push({ key, value });
      }
    }
  }

  return pairs;
}

function normalizeKey(key: string): string {
  return key.toUpperCase().replace(/\s+/g, "_");
}

function parseNumericIfPossible(key: string, value: string): string | number {
  const numericKeys = [
    "L_ПЛАН", "L_ПРОФИЛЬ", "ДИАМЕТР_ТРУБЫ", "ДИАМЕТР_СКВАЖИНЫ",
    "КОЛ_ТРУБ", "ДИАМЕТР",
  ];
  if (numericKeys.includes(key.toUpperCase().replace(/\s+/g, "_"))) {
    const num = parseFloat(value.replace(",", ".").replace(/\s/g, ""));
    if (!isNaN(num)) return num;
  }
  return value;
}

/**
 * Parse signatory text from Claude extraction into Signatory-like object.
 * Input: "Мастер по ЭРС СВРЭС АО «ОЭК» Акимов Ю.О." or
 *        "Акимов Ю.О., Мастер по ЭРС, АО «ОЭК»"
 * Output: { full_name, position, org_description, ... }
 */
function parseSignatoryText(v: unknown): unknown {
  const text = String(v).trim();
  if (!text || text === "не найдено") return undefined;

  // Try to extract ФИО (Surname I.O. pattern)
  const fioMatch = text.match(/([А-ЯЁ][а-яё]+\s+[А-ЯЁ]\.[А-ЯЁ]\.?)/);
  const fullName = fioMatch ? fioMatch[1] : text.slice(0, 40);

  // Try to extract organization (АО/ООО/АНО pattern)
  const orgMatch = text.match(/((?:АО|ООО|АНО|ЗАО|ИП)\s*[«"][^»"]+[»"])/);
  const org = orgMatch ? orgMatch[1] : "";

  // Position = everything that's not FIO and not org
  let position = text;
  if (fioMatch) position = position.replace(fioMatch[0], "");
  if (orgMatch) position = position.replace(orgMatch[0], "");
  position = position.replace(/[,;—\-]+/g, " ").replace(/\s+/g, " ").trim();

  return {
    person_id: "",
    role: "",
    org_description: org,
    position: position || "—",
    full_name: fullName,
    aosr_full_line: text,
  };
}

/** Safely parse date string (DD.MM.YYYY) to DateComponents. Returns string if parse fails. */
function safeParseDateValue(v: unknown): unknown {
  const s = String(v).trim();
  try {
    return parseDate(s);
  } catch {
    return s; // Keep as string if parse fails
  }
}

function buildSummary(
  docClass: DocClass,
  fields: ExtractionField[],
  materialSubtype?: MaterialSubtype,
): string {
  const label = DOC_TYPE_LABELS[docClass] ?? docClass;
  const fieldCount = fields.length;
  const matLabel = materialSubtype ? ` (${MATERIAL_LABELS[materialSubtype]})` : "";
  return `${label}${matLabel}: извлечено ${fieldCount} полей`;
}

function overallConfidence(fields: ExtractionField[]): FieldConfidence {
  const confidences = fields.map((f) => f.confidence);
  if (confidences.every((c) => c === "high")) return "high";
  if (confidences.some((c) => c === "low")) return "low";
  return "medium";
}

const DOC_TYPE_LABELS: Partial<Record<DocClass, string>> = {
  executive_scheme: "Исполнительная схема",
  passport_pipe: "Паспорт трубы",
  certificate: "Сертификат",
  order: "Приказ",
  appointment_letter: "Распоряжение/назначение",
  prior_aosr: "АОСР (ранее)",
  prior_internal_act: "Внутренние акты (ранее)",
  summary_excel: "Excel сводка",
  photo_of_doc: "Фото документа",
  unknown: "Документ",
};

// === Field mapping config ===

interface FieldMapEntry {
  fieldName: FieldName;
  transform?: (v: string | number) => unknown;
}

const FIELD_MAPPING: Partial<Record<DocClass, Record<string, FieldMapEntry>>> = {
  executive_scheme: {
    НОМЕР_ГНБ: { fieldName: "gnb_number" },
    ОБЪЕКТ: { fieldName: "object_name" },
    ЗАГОЛОВОК: { fieldName: "title_line" },
    АДРЕС: { fieldName: "address" },
    ШИФР_ПРОЕКТА: { fieldName: "project_number" },
    ЗАКАЗЧИК: { fieldName: "organizations.customer", transform: (v) => ({ name: String(v), short_name: "" }) },
    L_ПЛАН: { fieldName: "gnb_params.plan_length" },
    L_ПРОФИЛЬ: { fieldName: "gnb_params.profile_length" },
    КОЛ_ТРУБ: { fieldName: "gnb_params.pipe_count" },
    ДИАМЕТР_СКВАЖИНЫ: { fieldName: "gnb_params.drill_diameter" },
    КОНФИГУРАЦИЯ: { fieldName: "gnb_params.configuration" },
  },
  passport_pipe: {
    МАРКА_ТРУБЫ: { fieldName: "pipe", transform: (v) => ({ _merge: true, mark: String(v) }) },
    ДИАМЕТР: { fieldName: "pipe", transform: (v) => ({ _merge: true, diameter: `d=${v}`, diameter_mm: typeof v === "number" ? v : parseInt(String(v), 10) || 0 }) },
  },
  order: {
    // Order fields map to signatory data, but we can't know which role without context.
    // Caller must resolve role. We store raw extraction for the mapper to handle.
  },
  appointment_letter: {
    // Same as order — signatory resolution is role-dependent.
  },
  prior_internal_act: {
    НОМЕР_ГНБ: { fieldName: "gnb_number" },
    ЗАГОЛОВОК: { fieldName: "title_line" },
    ОБЪЕКТ: { fieldName: "object_name" },
    АДРЕС: { fieldName: "address" },
    ЗАКАЗЧИК: { fieldName: "organizations.customer", transform: (v) => ({ name: String(v), short_name: "" }) },
    ПОДРЯДЧИК: { fieldName: "organizations.contractor", transform: (v) => ({ name: String(v), short_name: "" }) },
    ПРОЕКТИРОВЩИК: { fieldName: "organizations.designer", transform: (v) => ({ name: String(v), short_name: "" }) },
    ИСПОЛНИТЕЛЬ: { fieldName: "executor" },
    ШИФР_ПРОЕКТА: { fieldName: "project_number" },
    ДАТА_НАЧАЛА: { fieldName: "start_date", transform: safeParseDateValue },
    ДАТА_ОКОНЧАНИЯ: { fieldName: "end_date", transform: safeParseDateValue },
    L_ПЛАН: { fieldName: "gnb_params.plan_length" },
    L_ПРОФИЛЬ: { fieldName: "gnb_params.profile_length" },
    КОЛ_ТРУБ: { fieldName: "gnb_params.pipe_count" },
    ДИАМЕТР_СКВАЖИНЫ: { fieldName: "gnb_params.drill_diameter" },
    КОНФИГУРАЦИЯ: { fieldName: "gnb_params.configuration" },
    МАРКА_ТРУБЫ: { fieldName: "pipe", transform: (v) => ({ _merge: true, mark: String(v) }) },
    ПОДПИСАНТ_1: { fieldName: "signatories.sign1_customer", transform: parseSignatoryText },
    ПОДПИСАНТ_2: { fieldName: "signatories.sign2_contractor", transform: parseSignatoryText },
    ПОДПИСАНТ_3: { fieldName: "signatories.sign3_optional", transform: parseSignatoryText },
    ПОДПИСАНТ_ТН: { fieldName: "signatories.tech_supervisor", transform: parseSignatoryText },
  },
  prior_aosr: {
    НОМЕР_ГНБ: { fieldName: "gnb_number" },
    ЗАГОЛОВОК: { fieldName: "title_line" },
    ОБЪЕКТ: { fieldName: "object_name" },
    АДРЕС: { fieldName: "address" },
    ЗАКАЗЧИК: { fieldName: "organizations.customer", transform: (v) => ({ name: String(v), short_name: "" }) },
    ПОДРЯДЧИК: { fieldName: "organizations.contractor", transform: (v) => ({ name: String(v), short_name: "" }) },
    ПРОЕКТИРОВЩИК: { fieldName: "organizations.designer", transform: (v) => ({ name: String(v), short_name: "" }) },
    ИСПОЛНИТЕЛЬ: { fieldName: "executor" },
    ШИФР_ПРОЕКТА: { fieldName: "project_number" },
    ДАТА_НАЧАЛА: { fieldName: "start_date", transform: safeParseDateValue },
    ДАТА_ОКОНЧАНИЯ: { fieldName: "end_date", transform: safeParseDateValue },
    L_ПЛАН: { fieldName: "gnb_params.plan_length" },
    L_ПРОФИЛЬ: { fieldName: "gnb_params.profile_length" },
    КОЛ_ТРУБ: { fieldName: "gnb_params.pipe_count" },
    ДИАМЕТР_СКВАЖИНЫ: { fieldName: "gnb_params.drill_diameter" },
    КОНФИГУРАЦИЯ: { fieldName: "gnb_params.configuration" },
    МАРКА_ТРУБЫ: { fieldName: "pipe", transform: (v) => ({ _merge: true, mark: String(v) }) },
    ПОДПИСАНТ_1: { fieldName: "signatories.sign1_customer", transform: parseSignatoryText },
    ПОДПИСАНТ_2: { fieldName: "signatories.sign2_contractor", transform: parseSignatoryText },
    ПОДПИСАНТ_3: { fieldName: "signatories.sign3_optional", transform: parseSignatoryText },
    ПОДПИСАНТ_ТН: { fieldName: "signatories.tech_supervisor", transform: parseSignatoryText },
  },
  summary_excel: {
    НОМЕР_ГНБ: { fieldName: "gnb_number" },
    ЗАГОЛОВОК: { fieldName: "title_line" },
    ОБЪЕКТ: { fieldName: "object_name" },
    АДРЕС: { fieldName: "address" },
    ЗАКАЗЧИК: { fieldName: "organizations.customer", transform: (v) => ({ name: String(v), short_name: "" }) },
    ПОДРЯДЧИК: { fieldName: "organizations.contractor", transform: (v) => ({ name: String(v), short_name: "" }) },
    ПРОЕКТИРОВЩИК: { fieldName: "organizations.designer", transform: (v) => ({ name: String(v), short_name: "" }) },
    ИСПОЛНИТЕЛЬ: { fieldName: "executor" },
    ШИФР_ПРОЕКТА: { fieldName: "project_number" },
    ДАТА_НАЧАЛА: { fieldName: "start_date", transform: safeParseDateValue },
    ДАТА_ОКОНЧАНИЯ: { fieldName: "end_date", transform: safeParseDateValue },
    L_ПЛАН: { fieldName: "gnb_params.plan_length" },
    L_ПРОФИЛЬ: { fieldName: "gnb_params.profile_length" },
    КОЛ_ТРУБ: { fieldName: "gnb_params.pipe_count" },
    ДИАМЕТР_СКВАЖИНЫ: { fieldName: "gnb_params.drill_diameter" },
    КОНФИГУРАЦИЯ: { fieldName: "gnb_params.configuration" },
    МАРКА_ТРУБЫ: { fieldName: "pipe", transform: (v) => ({ _merge: true, mark: String(v) }) },
    ПОДПИСАНТ_1: { fieldName: "signatories.sign1_customer", transform: parseSignatoryText },
    ПОДПИСАНТ_2: { fieldName: "signatories.sign2_contractor", transform: parseSignatoryText },
    ПОДПИСАНТ_3: { fieldName: "signatories.sign3_optional", transform: parseSignatoryText },
    ПОДПИСАНТ_ТН: { fieldName: "signatories.tech_supervisor", transform: parseSignatoryText },
  },
};
