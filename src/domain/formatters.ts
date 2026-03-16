/**
 * Domain formatters for GNB executive documentation.
 * Gate decision: ЗП 5-5 v2 canonical format.
 * - C-column: no underscores ("Мастер по ЭРС СВРЭС  Коробков Ю.Н.")
 * - B-column: org/role description only ("Представитель АО «ОЭК»")
 * - C-column: position + name ("Мастер по ЭРС СВРЭС  Коробков Ю.Н.")
 */

import type { DateComponents, Signatory, Organization, Pipe, Materials } from "./types.js";

// === Month maps ===

const MONTH_GENITIVE: Record<number, string> = {
  1: "января", 2: "февраля", 3: "марта", 4: "апреля",
  5: "мая", 6: "июня", 7: "июля", 8: "августа",
  9: "сентября", 10: "октября", 11: "ноября", 12: "декабря",
};

const MONTH_NAME_TO_NUMBER: Record<string, number> = {
  январь: 1, января: 1, янв: 1,
  февраль: 2, февраля: 2, фев: 2,
  март: 3, марта: 3, мар: 3,
  апрель: 4, апреля: 4, апр: 4,
  май: 5, мая: 5,
  июнь: 6, июня: 6, июн: 6,
  июль: 7, июля: 7, июл: 7,
  август: 8, августа: 8, авг: 8,
  сентябрь: 9, сентября: 9, сен: 9,
  октябрь: 10, октября: 10, окт: 10,
  ноябрь: 11, ноября: 11, ноя: 11,
  декабрь: 12, декабря: 12, дек: 12,
};

// === Date formatting ===

/**
 * Format date for internal acts: «6» октября 2025 г.
 */
export function formatDateInternal(d: DateComponents): string {
  return `«${d.day}» ${d.month} ${d.year} г.`;
}

/**
 * Get month in genitive case by number (1-12).
 */
export function monthGenitive(month: number): string {
  const result = MONTH_GENITIVE[month];
  if (!result) throw new Error(`Invalid month number: ${month}`);
  return result;
}

/**
 * Parse a date string into DateComponents.
 * Accepts: "10.12.2025", "10 декабря 2025", "10/12/2025", "2025-12-10"
 */
export function parseDate(input: string): DateComponents {
  const trimmed = input.trim();

  // DD.MM.YYYY or DD/MM/YYYY
  const dotMatch = trimmed.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (dotMatch) {
    const month = parseInt(dotMatch[2], 10);
    return {
      day: parseInt(dotMatch[1], 10),
      month: monthGenitive(month),
      year: parseInt(dotMatch[3], 10),
    };
  }

  // YYYY-MM-DD (ISO)
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const month = parseInt(isoMatch[2], 10);
    return {
      day: parseInt(isoMatch[3], 10),
      month: monthGenitive(month),
      year: parseInt(isoMatch[1], 10),
    };
  }

  // "10 декабря 2025" or "10 декабря 2025 г."
  const textMatch = trimmed.match(/^(\d{1,2})\s+([а-яё]+)\s+(\d{4})/i);
  if (textMatch) {
    const monthName = textMatch[2].toLowerCase();
    const monthNum = MONTH_NAME_TO_NUMBER[monthName];
    if (!monthNum) throw new Error(`Unknown month name: ${textMatch[2]}`);
    return {
      day: parseInt(textMatch[1], 10),
      month: monthGenitive(monthNum),
      year: parseInt(textMatch[3], 10),
    };
  }

  throw new Error(`Cannot parse date: "${input}"`);
}

// === Signatory formatting ===

/**
 * B-column: org/role description.
 * ЗП 5-5 style: "Представитель АО «ОЭК»"
 */
export function formatSignatoryDesc(s: Signatory): string {
  return s.org_description;
}

/**
 * C-column: position + name (no underscores).
 * ЗП 5-5 style: "Мастер по ЭРС СВРЭС  Коробков Ю.Н."
 * Double space between position and name (matches golden reference).
 */
export function formatSignatorySign(s: Signatory): string {
  return `${s.position}  ${s.full_name}`;
}

// === Organization formatting (for АОСР) ===

/**
 * Format organization for АОСР(1) hardcoded cells.
 * Full string with ОГРН/ИНН/address/phone/SRO.
 */
export function formatOrgAosr(
  org: Organization,
  role: "customer" | "contractor" | "designer",
): string {
  const parts: string[] = [];

  // Name with department for customer
  if (role === "customer" && org.department) {
    parts.push(`${org.department} ${org.name}`);
  } else {
    parts.push(org.name);
  }

  parts.push(`ОГРН ${org.ogrn}`);
  parts.push(`ИНН ${org.inn}`);
  parts.push(org.legal_address);
  parts.push(`тел. ${org.phone}`);

  // SRO info
  if (org.sro_name) {
    let sroLine = org.sro_name;
    if (org.sro_ogrn) sroLine += ` ОГРН ${org.sro_ogrn}`;
    if (org.sro_inn) sroLine += ` ИНН ${org.sro_inn}`;
    parts.push(sroLine);
  }

  if (org.sro_number) {
    let sroId = org.sro_number;
    if (org.sro_date) sroId += ` от ${org.sro_date}`;
    parts.push(sroId);
  }

  return parts.join(", ");
}

// === Materials formatting (for АОСР(2).A49) ===

/**
 * Format materials string for АОСР(2).A49.
 * Includes pipe mark, quality passport, conformity certificate.
 */
export function formatMaterialsAosr(pipe: Pipe, materials?: Materials): string {
  const parts: string[] = [pipe.mark];

  if (pipe.quality_passport) {
    parts.push(`Паспорт качества ${pipe.quality_passport}`);
  }
  if (pipe.conformity_cert) {
    parts.push(`Сертификат соответствия ${pipe.conformity_cert}`);
  }

  if (materials?.ukpt?.passport) {
    parts.push(`УКПТ: паспорт ${materials.ukpt.passport}`);
  }
  if (materials?.ukpt?.cert_letter) {
    parts.push(`письмо ${materials.ukpt.cert_letter}`);
  }
  if (materials?.plugs?.cert_letter) {
    parts.push(`Заглушки: письмо ${materials.plugs.cert_letter}`);
  }
  if (materials?.cord?.cert_letter) {
    parts.push(`Шнур: письмо ${materials.cord.cert_letter}`);
  }

  return parts.join(", ");
}

/**
 * Format project documentation line for АОСР(1).A45.
 */
export function formatProjectDocAosr(
  designer: Organization,
  projectNumber: string,
): string {
  const name = designer.short_name ?? designer.name;
  return `Проектная документация ${name}, шифр ${projectNumber}`;
}

// === GNB number parsing ===

/**
 * Parse GNB number input into full and short forms.
 * "5-5" → { full: "ЗП № 5-5", short: "5-5" }
 * "ЗП 5-5" → { full: "ЗП № 5-5", short: "5-5" }
 * "ЗП № 5-5" → { full: "ЗП № 5-5", short: "5-5" }
 */
export function parseGnbNumber(input: string): { full: string; short: string } {
  const trimmed = input.trim();

  // Already full format
  const fullMatch = trimmed.match(/^ЗП\s*№?\s*(.+)$/i);
  if (fullMatch) {
    const short = fullMatch[1].trim();
    return { full: `ЗП № ${short}`, short };
  }

  // Just the number
  return { full: `ЗП № ${trimmed}`, short: trimmed };
}
