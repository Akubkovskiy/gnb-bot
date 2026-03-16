/**
 * Transition validation — 10 hard-stops from RFC v1.1.
 * 7 BLOCK, 2 WARN, 1 CONFIRM.
 */

import type { Transition, ValidationIssue, ValidationReport } from "./types.js";

/**
 * Validate a transition for completeness before generation.
 * Returns a report with blockers, warnings, and confirmations.
 */
export function validateTransition(t: Partial<Transition>): ValidationReport {
  const issues: ValidationIssue[] = [];

  // === BLOCK: required fields ===

  // 1. gnb_number
  if (!t.gnb_number?.trim()) {
    issues.push({ level: "BLOCK", field: "gnb_number", message: "Номер ГНБ не указан" });
  }

  // 2. customer
  if (!t.customer?.trim()) {
    issues.push({ level: "BLOCK", field: "customer", message: "Заказчик не указан" });
  }

  // 3. object
  if (!t.object?.trim()) {
    issues.push({ level: "BLOCK", field: "object", message: "Объект не указан" });
  }

  // 4. address
  if (!t.address?.trim()) {
    issues.push({ level: "BLOCK", field: "address", message: "Адрес не указан" });
  }

  // 5. start_date + end_date
  if (!t.start_date) {
    issues.push({ level: "BLOCK", field: "start_date", message: "Дата начала не указана" });
  }
  if (!t.end_date) {
    issues.push({ level: "BLOCK", field: "end_date", message: "Дата окончания не указана" });
  }

  // 6. signatories — at least sign1, sign2, tech
  if (!t.signatories?.sign1_customer?.full_name) {
    issues.push({ level: "BLOCK", field: "sign1", message: "Мастер РЭС (sign1) не указан" });
  }
  if (!t.signatories?.sign2_contractor?.full_name) {
    issues.push({ level: "BLOCK", field: "sign2", message: "Подрядчик (sign2) не указан" });
  }
  if (!t.signatories?.tech_supervisor?.full_name) {
    issues.push({ level: "BLOCK", field: "tech", message: "Технадзор не указан" });
  }

  // 7. profile_length (required for GNB params)
  if (!t.gnb_params?.profile_length) {
    issues.push({ level: "BLOCK", field: "profile_length", message: "L профиль не указан" });
  }

  // 8. organizations (required for rendering)
  if (!t.organizations?.customer || !t.organizations?.contractor) {
    issues.push({ level: "BLOCK", field: "organizations", message: "Организации не указаны (нужны для актов)" });
  }

  // === WARN: important but not blocking ===

  // 8. pipe info
  if (!t.pipe?.mark) {
    issues.push({ level: "WARN", field: "pipe_mark", message: "Марка трубы не указана" });
  }

  // 9. project_number
  if (!t.project_number?.trim()) {
    issues.push({ level: "WARN", field: "project_number", message: "Шифр проекта не указан" });
  }

  // === CONFIRM: needs explicit user OK ===

  // 10. sign3 absent
  if (!t.signatories?.sign3_optional) {
    issues.push({
      level: "CONFIRM",
      field: "sign3",
      message: "Субподрядчик (sign3) отсутствует — строки B22/C22 будут пустые. Продолжить?",
    });
  }

  const valid = !issues.some((i) => i.level === "BLOCK");

  return {
    valid,
    issues,
    checked_at: new Date().toISOString(),
  };
}

/**
 * Get only blocking issues from a validation report.
 */
export function getBlockers(report: ValidationReport): ValidationIssue[] {
  return report.issues.filter((i) => i.level === "BLOCK");
}

/**
 * Get warnings from a validation report.
 */
export function getWarnings(report: ValidationReport): ValidationIssue[] {
  return report.issues.filter((i) => i.level === "WARN");
}

/**
 * Get confirmation-required issues from a validation report.
 */
export function getConfirms(report: ValidationReport): ValidationIssue[] {
  return report.issues.filter((i) => i.level === "CONFIRM");
}
