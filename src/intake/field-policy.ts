/**
 * Field volatility policy — classifies transition fields as stable, semi-stable, or volatile.
 *
 * stable: almost always inherited (orgs, requisites, SRO, etc.)
 * semi_stable: usually same within object but needs review (signatories, pipe count, etc.)
 * volatile: must be updated for each new GNB (number, dates, lengths, address)
 */

import type { FieldName } from "./intake-types.js";
import type { FieldVolatility, FieldPolicy } from "./review-types.js";

export const FIELD_POLICIES: FieldPolicy[] = [
  // === Stable: almost always inherited ===
  { fieldName: "organizations.customer", volatility: "stable", label: "Организация-заказчик" },
  { fieldName: "organizations.contractor", volatility: "stable", label: "Организация-подрядчик" },
  { fieldName: "organizations.designer", volatility: "stable", label: "Организация-проектировщик" },
  { fieldName: "executor", volatility: "stable", label: "Исполнитель" },
  { fieldName: "customer", volatility: "stable", label: "Заказчик" },
  { fieldName: "object", volatility: "stable", label: "Объект" },
  { fieldName: "object_name", volatility: "stable", label: "Название стройки" },
  { fieldName: "title_line", volatility: "stable", label: "Наименование объекта" },

  // === Semi-stable: usually same but needs review ===
  { fieldName: "signatories.sign1_customer", volatility: "semi_stable", label: "Мастер РЭС (sign1)" },
  { fieldName: "signatories.sign2_contractor", volatility: "semi_stable", label: "Подрядчик (sign2)" },
  { fieldName: "signatories.sign3_optional", volatility: "semi_stable", label: "Субподрядчик (sign3)" },
  { fieldName: "signatories.tech_supervisor", volatility: "semi_stable", label: "Технадзор" },
  { fieldName: "gnb_params.pipe_count", volatility: "semi_stable", label: "Количество труб" },
  { fieldName: "gnb_params.drill_diameter", volatility: "semi_stable", label: "Диаметр скважины" },
  { fieldName: "gnb_params.configuration", volatility: "semi_stable", label: "Конфигурация" },
  { fieldName: "pipe", volatility: "semi_stable", label: "Труба (марка/паспорт)" },
  { fieldName: "materials", volatility: "semi_stable", label: "Материалы" },
  { fieldName: "project_number", volatility: "semi_stable", label: "Шифр проекта" },

  // === Volatile: must update for each GNB ===
  { fieldName: "gnb_number", volatility: "volatile", label: "Номер ГНБ" },
  { fieldName: "gnb_number_short", volatility: "volatile", label: "Короткий номер ГНБ" },
  { fieldName: "start_date", volatility: "volatile", label: "Дата начала" },
  { fieldName: "end_date", volatility: "volatile", label: "Дата окончания" },
  { fieldName: "act_date", volatility: "volatile", label: "Дата акта" },
  { fieldName: "address", volatility: "volatile", label: "Адрес" },
  { fieldName: "gnb_params.profile_length", volatility: "volatile", label: "L профиль" },
  { fieldName: "gnb_params.plan_length", volatility: "volatile", label: "L план" },
];

/** Get policy for a field. Returns undefined if field has no explicit policy. */
export function getFieldPolicy(fieldName: FieldName): FieldPolicy | undefined {
  return FIELD_POLICIES.find((p) => p.fieldName === fieldName);
}

/** Get volatility for a field. Defaults to "volatile" if no explicit policy. */
export function getVolatility(fieldName: FieldName): FieldVolatility {
  return getFieldPolicy(fieldName)?.volatility ?? "volatile";
}

/** Get human-readable label for a field. */
export function getFieldLabel(fieldName: FieldName): string {
  return getFieldPolicy(fieldName)?.label ?? fieldName;
}

/** Get all fields of a given volatility. */
export function fieldsByVolatility(v: FieldVolatility): FieldPolicy[] {
  return FIELD_POLICIES.filter((p) => p.volatility === v);
}

/** Check if a field is semi-stable (needs attention if inherited without update). */
export function needsAttentionIfInherited(fieldName: FieldName): boolean {
  return getVolatility(fieldName) === "semi_stable";
}
