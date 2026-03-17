/**
 * Intake response builder — concise, engineering-style Telegram messages.
 */

import type { IntakeDraft, DocClass, FieldName } from "./intake-types.js";
import type { Transition } from "../domain/types.js";
import type { ReviewReport } from "./review-types.js";
import { REQUIRED_FIELDS } from "./intake-types.js";
import { hasExecutiveSchemeSource } from "./passport-builder.js";
import { getFieldLabel } from "./field-policy.js";

// === Intake event response ===

export interface IntakeResponseInput {
  docClass: DocClass;
  fileName?: string;
  summary: string;
  fieldsExtracted: number;
  fieldsUpdated: number;
  conflictsFound: number;
  warnings: string[];
  draft: IntakeDraft;
  base?: Transition;
  /** Updated field names + values for owner-facing display. */
  updatedFields?: Array<{ name: FieldName; value: unknown }>;
  /** Conflicting field names for owner-facing display. */
  conflictFields?: Array<{ name: FieldName; currentValue: unknown; candidateValue: unknown }>;
  /** All extracted field names + values (for "all already present" display). */
  allExtractedFields?: Array<{ name: FieldName; value: unknown }>;
}

const DOC_CLASS_LABELS: Partial<Record<DocClass, string>> = {
  executive_scheme: "ИС (исполнительная схема)",
  passport_pipe: "Паспорт трубы",
  certificate: "Сертификат",
  order: "Приказ",
  appointment_letter: "Распоряжение",
  prior_aosr: "АОСР (ранее)",
  prior_internal_act: "Внутренние акты (ранее)",
  summary_excel: "Excel сводка",
  photo_of_doc: "Фото документа",
  free_text_note: "Текстовый ввод",
  unknown: "Документ",
};

export function buildIntakeResponse(input: IntakeResponseInput): string {
  const label = DOC_CLASS_LABELS[input.docClass] ?? input.docClass;
  const requiredPresent = REQUIRED_FIELDS.filter((r) =>
    input.draft.fields.some((f) => f.field_name === r && !f.conflict_with_existing),
  ).length;
  const requiredTotal = REQUIRED_FIELDS.length;

  const parts: string[] = [];

  // Line 1: what was received
  const fileName = input.fileName ? `: ${input.fileName}` : "";
  parts.push(`📎 ${label}${fileName}`);

  // Show actual updated fields
  if (input.updatedFields && input.updatedFields.length > 0) {
    for (const f of input.updatedFields.slice(0, 6)) {
      parts.push(`  ${getFieldLabel(f.name)}: ${formatValue(f.value)}`);
    }
    if (input.updatedFields.length > 6) {
      parts.push(`  ...и ещё ${input.updatedFields.length - 6}`);
    }
  } else if (input.fieldsExtracted > 0 && input.fieldsUpdated === 0) {
    // Extracted but nothing new — show all recognized fields
    parts.push(`Распознано ${input.fieldsExtracted} полей — все уже есть:`);
    if (input.allExtractedFields && input.allExtractedFields.length > 0) {
      for (const f of input.allExtractedFields) {
        parts.push(`  ${getFieldLabel(f.name)}: ${formatValue(f.value)}`);
      }
    }
  } else if (input.fieldsExtracted > 0) {
    parts.push(`Обновлено: ${input.fieldsUpdated} из ${input.fieldsExtracted}`);
  } else {
    parts.push("Не удалось извлечь структурированные данные");
  }

  // Warnings inline
  if (input.warnings.length > 0) {
    parts.push(`  ⚠ ${input.warnings[0]}`);
  }
  if (input.conflictFields && input.conflictFields.length > 0) {
    parts.push(`⚠ Конфликты (${input.conflictFields.length}):`);
    for (const c of input.conflictFields.slice(0, 5)) {
      parts.push(`  • ${getFieldLabel(c.name)}: было "${formatValue(c.currentValue)}" → новое "${formatValue(c.candidateValue)}"`);
    }
    if (input.conflictFields.length > 5) {
      parts.push(`  ...и ещё ${input.conflictFields.length - 5}`);
    }
  } else if (input.conflictsFound > 0) {
    parts.push(`  ⚠ Конфликтов: ${input.conflictsFound}`);
  }

  // Compact progress line
  parts.push(`\n✅ ${requiredPresent}/${requiredTotal} обязательных полей`);

  return parts.join("\n");
}

/**
 * Build missing fields text (for "Не хватает" button callback).
 */
export function buildMissingFieldsText(draft: IntakeDraft): string {
  const lines: string[] = [];
  const missingRequired = REQUIRED_FIELDS.filter(
    (r) => !draft.fields.some((f) => f.field_name === r && !f.conflict_with_existing),
  );

  if (missingRequired.length === 0) {
    lines.push("✅ Все обязательные поля заполнены.");
  } else {
    lines.push("❌ Не хватает:");
    for (const f of missingRequired) {
      lines.push(`  • ${getFieldLabel(f as FieldName)}`);
    }
  }

  if (!hasExecutiveSchemeSource(draft)) {
    lines.push("\n📌 ИС PDF ещё не прислана (нужна для геометрии)");
  }

  return lines.join("\n");
}

// === Review text ===

export function buildReviewText(report: ReviewReport): string {
  const lines: string[] = [];
  const p = report.passport;

  lines.push("📋 Паспорт ГНБ");
  lines.push("═══════════════");

  // Identity
  if (p.identity.customer) lines.push(`Заказчик: ${p.identity.customer}`);
  if (p.identity.object) lines.push(`Объект: ${p.identity.object}`);
  if (p.identity.gnb_number) lines.push(`Номер: ${p.identity.gnb_number}`);
  if (p.identity.title_line) lines.push(`Наименование: ${p.identity.title_line}`);
  if (p.identity.project_number) lines.push(`Шифр: ${p.identity.project_number}`);

  // Geometry
  if (p.geometry.address) lines.push(`Адрес: ${p.geometry.address}`);
  if (p.geometry.profile_length) lines.push(`L проф: ${p.geometry.profile_length} м`);
  if (p.geometry.plan_length) lines.push(`L план: ${p.geometry.plan_length} м`);
  if (p.geometry.pipe_count) lines.push(`Труб: ${p.geometry.pipe_count}`);

  // Dates
  if (p.dates.start_date) lines.push(`Начало: «${p.dates.start_date.day}» ${p.dates.start_date.month} ${p.dates.start_date.year} г.`);
  if (p.dates.end_date) lines.push(`Окончание: «${p.dates.end_date.day}» ${p.dates.end_date.month} ${p.dates.end_date.year} г.`);

  // Signatories
  const sigs: string[] = [];
  if (p.signatories.sign1) sigs.push(`  1. ${p.signatories.sign1.org} — ${p.signatories.sign1.full_name}, ${p.signatories.sign1.position}`);
  if (p.signatories.sign2) sigs.push(`  2. ${p.signatories.sign2.org} — ${p.signatories.sign2.full_name}, ${p.signatories.sign2.position}`);
  if (p.signatories.sign3) sigs.push(`  3. ${p.signatories.sign3.org} — ${p.signatories.sign3.full_name}, ${p.signatories.sign3.position}`);
  if (p.signatories.tech) sigs.push(`  4. Технадзор — ${p.signatories.tech.full_name}, ${p.signatories.tech.position}`);
  if (sigs.length > 0) {
    lines.push("Подписанты:");
    lines.push(...sigs);
  }

  // Pipe
  if (p.pipe.mark) lines.push(`Труба: ${p.pipe.mark}`);

  // Sections
  if (report.inherited.length > 0) {
    lines.push(`\n✅ Унаследовано: ${report.inherited.length} полей`);
  }

  if (report.changed.length > 0) {
    lines.push(`\n🔄 Изменено:`);
    for (const c of report.changed) {
      lines.push(`  • ${c.label}: ${formatValue(c.old_value)} → ${formatValue(c.new_value)}`);
    }
  }

  if (report.needs_attention.length > 0) {
    lines.push(`\n⚠️ Требует проверки:`);
    for (const a of report.needs_attention.slice(0, 8)) {
      lines.push(`  • ${a.label}: ${formatValue(a.value)}`);
    }
  }

  if (report.missing.length > 0) {
    const blockers = report.missing.filter((m) => m.required);
    const warnings = report.missing.filter((m) => !m.required);

    if (blockers.length > 0) {
      lines.push(`\n❌ Не хватает (блокеры):`);
      for (const m of blockers) {
        lines.push(`  • ${m.label}`);
      }
    }
    if (warnings.length > 0) {
      lines.push(`\n⚠️ Желательно:`);
      for (const m of warnings) {
        lines.push(`  • ${m.label}`);
      }
    }
  }

  if (report.conflicts.length > 0) {
    lines.push(`\n🔴 Конфликты (${report.conflicts.length}):`);
    for (const c of report.conflicts) {
      lines.push(`  • ${c.label}: "${formatValue(c.current_value)}" vs "${formatValue(c.candidate_value)}"`);
    }
  }

  // Scheme
  if (!report.passport.meta.has_executive_scheme) {
    lines.push("\n📌 ИС PDF не прислана — геометрия неполная");
  }

  // Verdict
  lines.push("");
  if (report.ready_for_confirmation) {
    lines.push("✅ Готово к генерации. Подтвердить? (да / нет)");
  } else {
    lines.push("❌ Не готово к генерации. Дополните данные и /review_gnb.");
  }

  return lines.join("\n");
}

// === Confirm blocked text ===

export function buildConfirmBlockedText(report: ReviewReport): string {
  const lines: string[] = ["❌ Не готово к генерации:"];

  const blockers = report.missing.filter((m) => m.required);
  if (blockers.length > 0) {
    lines.push("Не хватает:");
    for (const m of blockers) {
      lines.push(`  • ${m.label}`);
    }
  }

  if (report.conflicts.length > 0) {
    lines.push(`Неразрешённых конфликтов: ${report.conflicts.length}`);
  }

  lines.push("\nДополните данные и /review_gnb.");
  return lines.join("\n");
}

// === Helpers ===

function formatValue(v: unknown): string {
  if (v === undefined || v === null) return "—";
  if (typeof v === "string") return v.length > 60 ? v.slice(0, 57) + "..." : v;
  if (typeof v === "number") return String(v);
  if (typeof v !== "object") return String(v);

  const obj = v as Record<string, unknown>;

  // DateComponents
  if ("day" in obj && "month" in obj && "year" in obj) {
    return `${obj.day} ${obj.month} ${obj.year}`;
  }
  // Signatory
  if ("full_name" in obj && "position" in obj) {
    return `${obj.full_name}, ${obj.position}`;
  }
  // Pipe
  if ("mark" in obj) {
    const pipe = obj as { mark?: string; diameter_mm?: number; quality_passport?: string };
    const parts = [pipe.mark];
    if (pipe.diameter_mm) parts.push(`d=${pipe.diameter_mm}`);
    return parts.filter(Boolean).join(", ");
  }
  // Organization
  if ("name" in obj && "short_name" in obj) {
    return (obj.short_name as string) || (obj.name as string);
  }
  // Organization (with just name)
  if ("name" in obj) {
    return obj.name as string;
  }

  // Fallback: extract key values instead of raw JSON
  const keys = Object.keys(obj).filter((k) => obj[k] != null && obj[k] !== "");
  if (keys.length <= 3) {
    return keys.map((k) => `${k}: ${obj[k]}`).join(", ");
  }
  return `(${keys.length} полей)`;
}
