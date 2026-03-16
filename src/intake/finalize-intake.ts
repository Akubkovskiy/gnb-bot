/**
 * Finalize intake draft → Transition.
 *
 * Bridges IntakeDraft to existing Transition type for renderers.
 * Uses existing validation from domain/validators.ts.
 */

import type { IntakeDraft, IntakeStores } from "./intake-types.js";
import type { Transition } from "../domain/types.js";
import { validateTransition } from "../domain/validators.js";
import { generateTransitionId } from "../domain/ids.js";

export interface FinalizeResult {
  success: boolean;
  transition?: Transition;
  errors: string[];
  warnings: string[];
}

/**
 * Convert IntakeDraft.data to a full Transition, validate, and save.
 */
export function finalizeIntake(
  draft: IntakeDraft,
  stores: IntakeStores,
): FinalizeResult {
  const d = draft.data;
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required identity
  if (!d.customer) errors.push("Не указан заказчик");
  if (!d.object) errors.push("Не указан объект");
  if (!d.gnb_number) errors.push("Не указан номер ГНБ");
  if (!d.address) errors.push("Не указан адрес");
  if (!d.start_date) errors.push("Не указана дата начала");
  if (!d.end_date) errors.push("Не указана дата окончания");
  if (!d.gnb_params?.profile_length) errors.push("Не указан L профиль");
  if (!d.organizations?.customer) errors.push("Не указана организация-заказчик");
  if (!d.organizations?.contractor) errors.push("Не указана организация-подрядчик");
  if (!d.signatories?.sign1_customer) errors.push("Не указан подписант 1 (мастер РЭС)");
  if (!d.signatories?.sign2_contractor) errors.push("Не указан подписант 2 (подрядчик)");
  if (!d.signatories?.tech_supervisor) errors.push("Не указан технадзор");

  if (errors.length > 0) {
    return { success: false, errors, warnings };
  }

  // Build transition
  const id = generateTransitionId(d.customer!, d.object!, d.gnb_number_short || d.gnb_number!);

  const transition: Transition = {
    id,
    status: "finalized",
    created_at: new Date().toISOString(),
    customer: d.customer!,
    object: d.object!,
    gnb_number: d.gnb_number!,
    gnb_number_short: d.gnb_number_short || d.gnb_number!,
    title_line: d.title_line || `Строительство КЛ методом ГНБ`,
    object_name: d.object_name || d.object!,
    address: d.address!,
    project_number: d.project_number || "",
    executor: d.executor || d.organizations?.contractor?.short_name || "",
    start_date: d.start_date!,
    end_date: d.end_date!,
    act_date: d.act_date || d.end_date!,
    refs: { person_ids: [], org_ids: [] },
    organizations: d.organizations as Transition["organizations"],
    signatories: d.signatories as Transition["signatories"],
    pipe: d.pipe || { mark: "", diameter: "", diameter_mm: 0 },
    gnb_params: {
      profile_length: d.gnb_params!.profile_length!,
      plan_length: d.gnb_params?.plan_length || 0,
      pipe_count: d.gnb_params?.pipe_count || 2,
      drill_diameter: d.gnb_params?.drill_diameter,
      configuration: d.gnb_params?.configuration,
    },
    source_docs: draft.sources.map((s) => s.original_file_name || s.source_id),
    generated_files: [],
    revisions: [],
  };

  // Validate
  const report = validateTransition(transition);
  const blockers = report.issues.filter((i) => i.level === "BLOCK");
  for (const b of blockers) {
    errors.push(b.message);
  }
  for (const i of report.issues.filter((i) => i.level === "WARN")) {
    warnings.push(i.message);
  }

  if (blockers.length > 0) {
    return { success: false, errors, warnings };
  }

  // Save
  stores.transitions.create(transition);

  // Update customer store
  try {
    stores.customers.updateLastGnb(d.customer!, d.object!, d.gnb_number!);
  } catch {
    // Non-critical
  }

  return { success: true, transition, errors: [], warnings };
}
