/**
 * Text extractor — extracts structured fields from free-text user messages.
 *
 * Pure functions, no external dependencies (no Claude CLI, no OCR).
 * Handles: dates, GNB numbers, addresses, signatory replacements,
 * pipe params, lengths, customer/object hints.
 *
 * Returns a list of ExtractedField candidates with confidence.
 */

import type { ExtractedField, FieldName, FieldConfidence } from "./intake-types.js";
import { parseDate, parseGnbNumber } from "../domain/formatters.js";
import type { DateComponents } from "../domain/types.js";

export interface ExtractionResult {
  fields: ExtractedField[];
  unmatched: string; // leftover text not matched to any field
}

/**
 * Extract all recognizable fields from a free-text message.
 */
export function extractFromText(text: string, sourceId: string): ExtractionResult {
  const fields: ExtractedField[] = [];
  let remaining = text;

  // === GNB number ===
  const gnbMatch = remaining.match(/(?:ЗП\s*(?:№\s*)?)?(\d+[-/]\d+|\d+)/i);
  if (gnbMatch) {
    const parsed = parseGnbNumber(gnbMatch[0]);
    // Only extract if it looks like a GNB number (has dash or "ЗП" prefix)
    if (gnbMatch[0].match(/ЗП|зп/i) || gnbMatch[1].includes("-") || gnbMatch[1].includes("/")) {
      fields.push(makeField("gnb_number", parsed.full, sourceId, "high"));
      fields.push(makeField("gnb_number_short", parsed.short, sourceId, "high"));
      remaining = remaining.replace(gnbMatch[0], " ");
    }
  }

  // === Dates ===
  const datePattern = /(\d{1,2}[./]\d{1,2}[./]\d{4})/g;
  const dateMatches = remaining.match(datePattern);
  if (dateMatches && dateMatches.length >= 2) {
    try {
      const startDate = parseDate(dateMatches[0]);
      const endDate = parseDate(dateMatches[1]);
      fields.push(makeField("start_date", startDate, sourceId, "high"));
      fields.push(makeField("end_date", endDate, sourceId, "high"));
      remaining = remaining.replace(dateMatches[0], " ").replace(dateMatches[1], " ");
    } catch {
      // Date parse failed — skip
    }
  } else if (dateMatches && dateMatches.length === 1) {
    // Single date — could be act_date or start_date, mark as medium
    try {
      const date = parseDate(dateMatches[0]);
      fields.push(makeField("start_date", date, sourceId, "medium", "одна дата — нужна вторая"));
      remaining = remaining.replace(dateMatches[0], " ");
    } catch {
      // skip
    }
  }

  // === Profile / plan lengths ===
  const profileMatch = remaining.match(/(?:l\s*проф|lпроф|профиль|проф)[:\s=]*(\d+[.,]?\d*)/i);
  if (profileMatch) {
    fields.push(makeField("gnb_params.profile_length", parseFloat(profileMatch[1].replace(",", ".")), sourceId, "high"));
    remaining = remaining.replace(profileMatch[0], " ");
  }

  const planMatch = remaining.match(/(?:l\s*план|lплан|план)[:\s=]*(\d+[.,]?\d*)/i);
  if (planMatch) {
    fields.push(makeField("gnb_params.plan_length", parseFloat(planMatch[1].replace(",", ".")), sourceId, "high"));
    remaining = remaining.replace(planMatch[0], " ");
  }

  // === Pipe count ===
  const countMatch = remaining.match(/(\d+)\s*(?:труб|шт)/i);
  if (countMatch) {
    fields.push(makeField("gnb_params.pipe_count", parseInt(countMatch[1], 10), sourceId, "high"));
    remaining = remaining.replace(countMatch[0], " ");
  }

  // === Drill diameter ===
  const diamMatch = remaining.match(/(?:d|д|диаметр)\s*(?:[а-яёА-ЯЁ]*)?\s*[=:\s]*(\d+)/i);
  if (diamMatch) {
    fields.push(makeField("gnb_params.drill_diameter", parseInt(diamMatch[1], 10), sourceId, "high"));
    remaining = remaining.replace(diamMatch[0], " ");
  }

  // === Pipe mark ===
  const pipeMatch = remaining.match(/((?:труба\s+)?(?:ЭЛЕКТРОПАЙП|ПЭ|ПНД)\s*[\d/\s\-SDRsdr.,]+)/i);
  if (pipeMatch) {
    const mark = pipeMatch[1].trim();
    fields.push(makeField("pipe", { mark, diameter: "", diameter_mm: 0 }, sourceId, "medium", "марка трубы — проверить полноту"));
    remaining = remaining.replace(pipeMatch[0], " ");
  }

  // === Address ===
  const addressMatch = remaining.match(/((?:г\.\s*)?(?:Москва|Санкт-Петербург)[,\s]+[^,\n]{5,})/i);
  if (addressMatch) {
    fields.push(makeField("address", addressMatch[1].trim(), sourceId, "high"));
    remaining = remaining.replace(addressMatch[0], " ");
  } else {
    // Try shorter address patterns
    const shortAddr = remaining.match(/(?:адрес[:\s]*)([\wа-яёА-ЯЁ\s.,\-/]+\d+)/i);
    if (shortAddr) {
      let addr = shortAddr[1].trim();
      if (!addr.match(/^г\./i)) addr = `г. Москва, ${addr}`;
      fields.push(makeField("address", addr, sourceId, "medium", "адрес — проверить"));
      remaining = remaining.replace(shortAddr[0], " ");
    }
  }

  // === Project number ===
  const projectMatch = remaining.match(/(?:шифр|проект|номер\s*проект\w*)[:\s]*([А-Яа-яA-Za-z0-9\-/.]+)/i);
  if (projectMatch) {
    fields.push(makeField("project_number", projectMatch[1].trim(), sourceId, "high"));
    remaining = remaining.replace(projectMatch[0], " ");
  }

  // === Title line (object name / project description) ===
  // Greedy capture: take everything after "Объект:" up to end of line
  // Do NOT strip «» — they're part of the official project name
  const titleMatch = remaining.match(/^(?:объект|наименование|строительство)\s*[:—]\s*(.{10,}?)$/im);
  if (titleMatch) {
    const title = titleMatch[1].trim();
    if (title.length > 10) {
      fields.push(makeField("title_line", title, sourceId, "medium", "наименование — проверить"));
      remaining = remaining.replace(titleMatch[0], " ");
    }
  }

  // === Customer ===
  const customerMatch = remaining.match(/(?:заказчик)[:\s—-]*([\wа-яёА-ЯЁ«»"]+(?:\s+[\wа-яёА-ЯЁ«»"]+)*)(?=\s{2,}|[,.\n]|$)/i);
  if (customerMatch) {
    fields.push(makeField("customer", customerMatch[1].trim(), sourceId, "medium"));
    remaining = remaining.replace(customerMatch[0], " ");
  }

  // === Object ===
  const objectMatch = remaining.match(/(?:объект)[:\s—-]*([\wа-яёА-ЯЁ\s]+?)(?:[,.\n]|$)/i);
  if (objectMatch && !titleMatch) {
    // Only if we didn't already match title_line
    fields.push(makeField("object", objectMatch[1].trim(), sourceId, "medium"));
    remaining = remaining.replace(objectMatch[0], " ");
  }

  // === Executor ===
  const executorMatch = remaining.match(/(?:исполнитель|подрядчик|генподрядчик)[:\s—-]*((?:ООО|АО|АНО|ЗАО|ИП)\s*[«"][^»"]+[»"])/i);
  if (executorMatch) {
    fields.push(makeField("executor", executorMatch[1].trim(), sourceId, "high"));
    remaining = remaining.replace(executorMatch[0], " ");
  }

  // === Signatories ===
  // Split input on signatory role keywords to handle multiple signatories in one message.
  // E.g. "технадзор Гайдуков, мастер Коробков, подрядчик Буряк"
  const ROLE_KEYWORDS = [
    { keywords: ["мастер", "sign1", "представитель"], field: "signatories.sign1_customer" as FieldName },
    { keywords: ["подрядчик", "sign2"], field: "signatories.sign2_contractor" as FieldName },
    { keywords: ["субподрядчик", "sign3"], field: "signatories.sign3_optional" as FieldName },
    { keywords: ["технадзор", "тн", "sign4", "tech"], field: "signatories.tech_supervisor" as FieldName },
  ];

  // Build a combined regex that splits on role boundaries
  const allRoleWords = ROLE_KEYWORDS.flatMap((r) => r.keywords);
  const roleSplitRegex = new RegExp(`(?:^|[,;→\\n])\\s*(?=${allRoleWords.join("|")})`, "im");
  const sigSegments = remaining.split(roleSplitRegex).filter((s) => s.trim());

  for (const segment of sigSegments) {
    const trimSeg = segment.trim();
    for (const { keywords, field } of ROLE_KEYWORDS) {
      const kwPattern = new RegExp(`^(?:${keywords.join("|")})[\\s:—\\-]+(.+)$`, "im");
      const sigMatch = trimSeg.match(kwPattern);
      if (sigMatch) {
        const text = sigMatch[1].trim();
        fields.push(makeField(field, parseSignatoryText(text), sourceId, "medium", "подписант из текста — проверить"));
        remaining = remaining.replace(trimSeg, " ");
        break;
      }
    }
  }

  // Clean up remaining
  const unmatched = remaining.replace(/\s+/g, " ").trim();

  return { fields, unmatched };
}

// === Helpers ===

/**
 * Parse signatory text into structured fields.
 * Handles: "инженер ЦРЭС АО «ОЭК» Селиванов В.Ю."
 * Strips order/NRS from position into separate fields.
 */
function parseSignatoryText(text: string): Record<string, unknown> {
  // Extract FIO
  const fioMatch = text.match(/([А-ЯЁ][а-яё]+\s+[А-ЯЁ]\.[А-ЯЁ]\.?)/);
  const fullName = fioMatch ? fioMatch[1] : capitalizeFirst(text.split(/[\s,;]+/)[0] || text);

  // Extract organization
  const orgMatch = text.match(/((?:АО|ООО|АНО|ЗАО|ИП)\s*[«"][^»"]+[»"])/);
  const org = orgMatch ? orgMatch[1] : "";

  // Extract NRS
  const nrsMatch = text.match(/(?:НРС|идентификационный\s*номер)\s*[№:]?\s*([А-Яа-яA-Za-z]?-?\d{2}-\d{5,})\s*(?:от\s*(\d{2}\.\d{2}\.\d{4}))?/i);
  const nrs_id = nrsMatch ? nrsMatch[1] : undefined;
  const nrs_date = nrsMatch ? nrsMatch[2] : undefined;

  // Extract order/appointment
  const orderMatch = text.match(/(?:приказ|распоряжение)\s*[№:]?\s*([^\s,]+)\s*(?:от\s*(\d{2}\.\d{2}\.\d{4}))?/i);
  const order_type = orderMatch ? (text.match(/распоряжение/i) ? "распоряжение" : "приказ") : undefined;
  const order_number = orderMatch ? orderMatch[1] : undefined;
  const order_date = orderMatch ? orderMatch[2] : undefined;

  // Build clean position: remove FIO, org, NRS, order from text
  let position = text;
  if (fioMatch) position = position.replace(fioMatch[0], "");
  if (orgMatch) position = position.replace(orgMatch[0], "");
  if (nrsMatch) position = position.replace(nrsMatch[0], "");
  if (orderMatch) position = position.replace(orderMatch[0], "");
  position = position.replace(/[,;—\-→]+/g, " ").replace(/\s+/g, " ").trim();

  if (!fioMatch && position.toLowerCase() === fullName.toLowerCase()) {
    position = "";
  }

  return {
    person_id: "",
    role: "",
    org_description: org,
    position: position || "—",
    full_name: fullName,
    aosr_full_line: text,
    ...(nrs_id ? { nrs_id, nrs_date } : {}),
    ...(order_type ? { order_type, order_number, order_date } : {}),
  };
}

/** Capitalize first letter of a surname (e.g. "гайдуков" → "Гайдуков"). */
function capitalizeFirst(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function makeField(
  fieldName: FieldName,
  value: unknown,
  sourceId: string,
  confidence: FieldConfidence,
  notes?: string,
): ExtractedField {
  return {
    field_name: fieldName,
    value,
    source_id: sourceId,
    source_type: "manual_text",
    confidence,
    confirmed_by_owner: false,
    conflict_with_existing: false,
    notes,
  };
}
