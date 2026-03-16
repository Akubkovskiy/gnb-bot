/**
 * GNB Passport builder — builds typed summary from IntakeDraft.
 */

import type { IntakeDraft } from "./intake-types.js";
import type { GnbPassportSummary } from "./review-types.js";

/**
 * Build a GNB passport summary from the current draft state.
 */
export function buildPassportSummary(draft: IntakeDraft): GnbPassportSummary {
  const d = draft.data;

  return {
    identity: {
      customer: d.customer,
      object: d.object,
      gnb_number: d.gnb_number,
      project_number: d.project_number,
      title_line: d.title_line,
      object_name: d.object_name,
    },
    geometry: {
      address: d.address,
      plan_length: d.gnb_params?.plan_length,
      profile_length: d.gnb_params?.profile_length,
      pipe_diameter_mm: d.pipe?.diameter_mm,
      pipe_count: d.gnb_params?.pipe_count,
      drill_diameter: d.gnb_params?.drill_diameter,
      configuration: d.gnb_params?.configuration,
    },
    organizations: {
      customer: d.organizations?.customer
        ? { name: d.organizations.customer.name, short_name: d.organizations.customer.short_name }
        : undefined,
      contractor: d.organizations?.contractor
        ? { name: d.organizations.contractor.name, short_name: d.organizations.contractor.short_name }
        : undefined,
      designer: d.organizations?.designer
        ? { name: d.organizations.designer.name, short_name: d.organizations.designer.short_name }
        : undefined,
    },
    signatories: {
      sign1: d.signatories?.sign1_customer
        ? { full_name: d.signatories.sign1_customer.full_name, position: d.signatories.sign1_customer.position, org: d.signatories.sign1_customer.org_description }
        : undefined,
      sign2: d.signatories?.sign2_contractor
        ? { full_name: d.signatories.sign2_contractor.full_name, position: d.signatories.sign2_contractor.position, org: d.signatories.sign2_contractor.org_description }
        : undefined,
      sign3: d.signatories?.sign3_optional
        ? { full_name: d.signatories.sign3_optional.full_name, position: d.signatories.sign3_optional.position, org: d.signatories.sign3_optional.org_description }
        : undefined,
      tech: d.signatories?.tech_supervisor
        ? { full_name: d.signatories.tech_supervisor.full_name, position: d.signatories.tech_supervisor.position, org: d.signatories.tech_supervisor.org_description }
        : undefined,
    },
    pipe: {
      mark: d.pipe?.mark,
      quality_passport: d.pipe?.quality_passport,
    },
    materials: {
      // Materials metadata is not yet in Transition type — placeholder
      bentonite: undefined,
      ukpt: undefined,
      plugs: undefined,
      cord: undefined,
    },
    dates: {
      start_date: d.start_date,
      end_date: d.end_date,
      act_date: d.act_date,
    },
    meta: {
      base_transition_id: draft.base_transition_id,
      source_documents_count: draft.sources.length,
      extracted_fields_count: draft.fields.filter((f) => !f.conflict_with_existing).length,
      has_executive_scheme: hasExecutiveSchemeSource(draft),
    },
  };
}

/**
 * Check if draft has an executive scheme among its sources.
 */
export function hasExecutiveSchemeSource(draft: IntakeDraft): boolean {
  return draft.sources.some((s) => s.doc_class === "executive_scheme");
}

/**
 * Check if manual geometry input is required (no scheme + missing geometry fields).
 */
export function requiresGeometryManualInput(draft: IntakeDraft): boolean {
  if (hasExecutiveSchemeSource(draft)) return false;
  const d = draft.data;
  return !d.gnb_params?.profile_length || !d.address;
}
