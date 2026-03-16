/**
 * Inheritance logic — populate IntakeDraft from previous GNB or Excel fallback.
 *
 * Previous GNB = primary base. Excel = supplemental fallback for missing stable fields.
 * No silent overwrite: inheritance sets fields with source_type "prior_act" / "excel".
 */

import type { Transition } from "../domain/types.js";
import type { IntakeDraft, ExtractedField, FieldName, SourceType } from "./intake-types.js";
import type { InheritanceBase } from "./review-types.js";
import type { TransitionStore } from "../store/transitions.js";
import type { IntakeDraftStore } from "../store/intake-drafts.js";
import { getVolatility } from "./field-policy.js";

// === Find base transition ===

/**
 * Find the best base transition for a new GNB on the same object.
 * Returns the most recent finalized transition for (customer, object).
 */
export function findBaseTransition(
  customer: string,
  object: string,
  transitions: TransitionStore,
): Transition | null {
  return transitions.getLastForObject(customer, object);
}

// === Build inheritance base info ===

export function buildInheritanceBase(transition: Transition): InheritanceBase {
  return {
    transition_id: transition.id,
    source: "previous_gnb",
    label: `${transition.gnb_number} (${transition.object})`,
  };
}

// === Apply base transition to draft ===

/**
 * Populate draft fields from a base transition.
 * Only sets fields that are stable or semi_stable.
 * Volatile fields (gnb_number, dates, lengths) are NOT inherited.
 *
 * Returns list of field names that were inherited.
 */
export function applyBaseTransitionToDraft(
  draftId: string,
  base: Transition,
  store: IntakeDraftStore,
): FieldName[] {
  const sourceId = `base:${base.id}`;
  const inherited: FieldName[] = [];

  const fieldsToInherit = extractInheritableFields(base);

  for (const field of fieldsToInherit) {
    const volatility = getVolatility(field.field_name);
    // Skip volatile fields — they must come from new data
    if (volatility === "volatile") continue;

    const result = store.setField(draftId, {
      ...field,
      source_id: sourceId,
      source_type: "prior_act",
    });
    if (result.updated) {
      inherited.push(field.field_name);
    }
  }

  // Set base_transition_id via store's setBaseTransitionId
  store.setBaseTransitionId(draftId, base.id);

  return inherited;
}

// === Extract inheritable fields from transition ===

function extractInheritableFields(t: Transition): ExtractedField[] {
  const fields: ExtractedField[] = [];
  const src = `base:${t.id}`;

  function add(name: FieldName, value: unknown) {
    if (value === undefined || value === null || value === "") return;
    fields.push({
      field_name: name,
      value,
      source_id: src,
      source_type: "prior_act",
      confidence: "high",
      confirmed_by_owner: false,
      conflict_with_existing: false,
    });
  }

  // Identity (stable)
  add("customer", t.customer);
  add("object", t.object);
  add("object_name", t.object_name);
  add("title_line", t.title_line);
  add("executor", t.executor);
  add("project_number", t.project_number);

  // Organizations (stable)
  if (t.organizations?.customer) add("organizations.customer", t.organizations.customer);
  if (t.organizations?.contractor) add("organizations.contractor", t.organizations.contractor);
  if (t.organizations?.designer) add("organizations.designer", t.organizations.designer);

  // Signatories (semi-stable)
  if (t.signatories?.sign1_customer) add("signatories.sign1_customer", t.signatories.sign1_customer);
  if (t.signatories?.sign2_contractor) add("signatories.sign2_contractor", t.signatories.sign2_contractor);
  if (t.signatories?.sign3_optional) add("signatories.sign3_optional", t.signatories.sign3_optional);
  if (t.signatories?.tech_supervisor) add("signatories.tech_supervisor", t.signatories.tech_supervisor);

  // Pipe (semi-stable)
  if (t.pipe) add("pipe", t.pipe);

  // Materials (semi-stable)
  if (t.materials) add("materials", t.materials);

  // GNB params — only semi-stable ones
  if (t.gnb_params?.pipe_count) add("gnb_params.pipe_count", t.gnb_params.pipe_count);
  if (t.gnb_params?.drill_diameter) add("gnb_params.drill_diameter", t.gnb_params.drill_diameter);
  if (t.gnb_params?.configuration) add("gnb_params.configuration", t.gnb_params.configuration);

  // Volatile fields intentionally NOT inherited:
  // gnb_number, gnb_number_short, start_date, end_date, act_date,
  // address, profile_length, plan_length

  return fields;
}

/**
 * Get list of volatile fields that are NOT inherited and must come from new data.
 * Useful for telling the owner what's needed.
 */
export function getVolatileFieldsNeeded(): FieldName[] {
  return [
    "gnb_number", "gnb_number_short",
    "start_date", "end_date",
    "address",
    "gnb_params.profile_length", "gnb_params.plan_length",
  ];
}
