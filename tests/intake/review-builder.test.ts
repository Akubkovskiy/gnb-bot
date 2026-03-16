/**
 * Tests for Phase 5.4: inheritance, field policy, conflicts, passport, review.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { IntakeDraftStore } from "../../src/store/intake-drafts.js";
import { TransitionStore } from "../../src/store/transitions.js";
import type { Transition } from "../../src/domain/types.js";
import type { FieldName, ExtractedField } from "../../src/intake/intake-types.js";
import { findBaseTransition, applyBaseTransitionToDraft, getVolatileFieldsNeeded } from "../../src/intake/inheritance.js";
import { getVolatility, getFieldLabel, needsAttentionIfInherited, fieldsByVolatility } from "../../src/intake/field-policy.js";
import { detectBaseConflicts, detectInternalConflicts, getAllConflicts } from "../../src/intake/conflicts.js";
import { buildPassportSummary, hasExecutiveSchemeSource, requiresGeometryManualInput } from "../../src/intake/passport-builder.js";
import { buildReviewReport, summarizeBase } from "../../src/intake/review-builder.js";
import { valuesMatch } from "../../src/intake/conflicts.js";

let tmpDir: string;
let store: IntakeDraftStore;
let transStore: TransitionStore;

// === Seed data ===

function seedBaseTransition(): Transition {
  const t: Transition = {
    id: "kraft-marino-3",
    status: "finalized",
    created_at: "2025-11-15T10:00:00.000Z",
    customer: "Крафт",
    object: "Марьино",
    gnb_number: "ЗП № 3",
    gnb_number_short: "3",
    title_line: "Строительство КЛ 10кВ методом ГНБ",
    object_name: "Марьино",
    address: "г. Москва, Огородный проезд, д. 11",
    project_number: "ШФ-123",
    executor: "ООО «СПЕЦИНЖСТРОЙ»",
    start_date: { day: 1, month: "ноября", year: 2025 },
    end_date: { day: 15, month: "ноября", year: 2025 },
    refs: { person_ids: [], org_ids: [] },
    organizations: {
      customer: { id: "oek", name: "АО «ОЭК»", short_name: "АО «ОЭК»", ogrn: "1057746394155", inn: "7720522853", legal_address: "Москва", phone: "", sro_name: "СРО" },
      contractor: { id: "st", name: "АНО «ОЭК Стройтрест»", short_name: "АНО «ОЭК Стройтрест»", ogrn: "1247700649591", inn: "7708442087", legal_address: "Москва", phone: "", sro_name: "СРО" },
      designer: { id: "sp", name: "ООО «СПЕЦИНЖСТРОЙ»", short_name: "ООО «СИС»", ogrn: "1167847487444", inn: "7806258664", legal_address: "Москва", phone: "", sro_name: "СРО" },
    },
    signatories: {
      sign1_customer: { person_id: "korobkov", role: "sign1", org_description: "АО «ОЭК»", position: "Мастер по ЭРС СВРЭС", full_name: "Коробков Ю.Н.", aosr_full_line: "..." },
      sign2_contractor: { person_id: "buryak", role: "sign2", org_description: "АНО «ОЭК Стройтрест»", position: "Начальник участка", full_name: "Буряк А.М.", aosr_full_line: "..." },
      tech_supervisor: { person_id: "gaydukov", role: "tech", org_description: "АО «ОЭК»", position: "Главный специалист ОТН", full_name: "Гайдуков Н.И.", aosr_full_line: "..." },
    },
    pipe: { mark: "Труба ЭЛЕКТРОПАЙП 225/170", diameter: "d=225", diameter_mm: 225 },
    gnb_params: { profile_length: 63.3, plan_length: 61.7, pipe_count: 2 },
    source_docs: [],
    generated_files: [],
    revisions: [],
  };
  transStore.create(t);
  return t;
}

function makeField(name: FieldName, value: unknown, opts: Partial<ExtractedField> = {}): ExtractedField {
  return {
    field_name: name,
    value,
    source_id: opts.source_id ?? "manual",
    source_type: opts.source_type ?? "manual_text",
    confidence: opts.confidence ?? "high",
    confirmed_by_owner: opts.confirmed_by_owner ?? false,
    conflict_with_existing: opts.conflict_with_existing ?? false,
  };
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "review-test-"));
  store = new IntakeDraftStore(tmpDir);
  transStore = new TransitionStore(tmpDir);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// === Field policy ===

describe("field-policy", () => {
  it("organizations are stable", () => {
    expect(getVolatility("organizations.customer")).toBe("stable");
    expect(getVolatility("organizations.contractor")).toBe("stable");
  });

  it("signatories are semi_stable", () => {
    expect(getVolatility("signatories.tech_supervisor")).toBe("semi_stable");
    expect(getVolatility("signatories.sign1_customer")).toBe("semi_stable");
  });

  it("gnb_number and dates are volatile", () => {
    expect(getVolatility("gnb_number")).toBe("volatile");
    expect(getVolatility("start_date")).toBe("volatile");
    expect(getVolatility("gnb_params.profile_length")).toBe("volatile");
  });

  it("semi_stable fields need attention if inherited", () => {
    expect(needsAttentionIfInherited("signatories.tech_supervisor")).toBe(true);
    expect(needsAttentionIfInherited("gnb_number")).toBe(false);
    expect(needsAttentionIfInherited("organizations.customer")).toBe(false);
  });

  it("getFieldLabel returns Russian labels", () => {
    expect(getFieldLabel("signatories.tech_supervisor")).toBe("Технадзор");
    expect(getFieldLabel("gnb_number")).toBe("Номер ГНБ");
  });

  it("fieldsByVolatility returns correct groups", () => {
    const stable = fieldsByVolatility("stable");
    expect(stable.length).toBeGreaterThan(0);
    expect(stable.every((f) => f.volatility === "stable")).toBe(true);
  });
});

// === Inheritance ===

describe("inheritance", () => {
  it("findBaseTransition returns last transition for object", () => {
    const base = seedBaseTransition();
    const found = findBaseTransition("Крафт", "Марьино", transStore);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(base.id);
  });

  it("findBaseTransition returns null for unknown object", () => {
    expect(findBaseTransition("Unknown", "Unknown", transStore)).toBeNull();
  });

  it("applyBaseTransitionToDraft inherits stable and semi-stable fields", () => {
    const base = seedBaseTransition();
    const draft = store.create(1);

    const inherited = applyBaseTransitionToDraft(draft.id, base, store);

    expect(inherited.length).toBeGreaterThan(5);
    expect(inherited).toContain("customer");
    expect(inherited).toContain("organizations.customer");
    expect(inherited).toContain("signatories.tech_supervisor");
    expect(inherited).toContain("pipe");
  });

  it("applyBaseTransitionToDraft does NOT inherit volatile fields", () => {
    const base = seedBaseTransition();
    const draft = store.create(1);

    const inherited = applyBaseTransitionToDraft(draft.id, base, store);

    expect(inherited).not.toContain("gnb_number");
    expect(inherited).not.toContain("start_date");
    expect(inherited).not.toContain("end_date");
    expect(inherited).not.toContain("address");
    expect(inherited).not.toContain("gnb_params.profile_length");
    expect(inherited).not.toContain("gnb_params.plan_length");
  });

  it("applyBaseTransitionToDraft sets base_transition_id", () => {
    const base = seedBaseTransition();
    const draft = store.create(1);
    applyBaseTransitionToDraft(draft.id, base, store);

    const loaded = store.get(draft.id)!;
    expect(loaded.base_transition_id).toBe("kraft-marino-3");
  });

  it("getVolatileFieldsNeeded lists required new data", () => {
    const volatile = getVolatileFieldsNeeded();
    expect(volatile).toContain("gnb_number");
    expect(volatile).toContain("start_date");
    expect(volatile).toContain("gnb_params.profile_length");
  });
});

// === Conflicts ===

describe("conflicts", () => {
  it("detectBaseConflicts finds differing semi-stable field", () => {
    const base = seedBaseTransition();
    const draft = store.create(1);
    applyBaseTransitionToDraft(draft.id, base, store);

    // New project_number (semi-stable) differs from base
    store.setField(draft.id, makeField("project_number", "ШФ-999"));

    const loaded = store.get(draft.id)!;
    const conflicts = detectBaseConflicts(loaded, base);

    const projConflict = conflicts.find((c) => c.field_name === "project_number");
    expect(projConflict).toBeDefined();
    expect(projConflict!.requires_owner_confirmation).toBe(true);
  });

  it("detectBaseConflicts ignores inherited fields (same source)", () => {
    const base = seedBaseTransition();
    const draft = store.create(1);
    applyBaseTransitionToDraft(draft.id, base, store);

    const loaded = store.get(draft.id)!;
    const conflicts = detectBaseConflicts(loaded, base);

    // No conflicts since all fields came from the same base
    expect(conflicts).toHaveLength(0);
  });

  it("detectInternalConflicts finds multi-value conflicts", () => {
    const draft = store.create(1);
    store.setField(draft.id, makeField("customer", "A", { source_type: "pdf", source_id: "s1" }));
    store.setField(draft.id, makeField("customer", "B", { source_type: "memory", source_id: "s2" }));

    const loaded = store.get(draft.id)!;
    const conflicts = detectInternalConflicts(loaded);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].current_value).toBe("A");
    expect(conflicts[0].candidate_value).toBe("B");
  });
});

// === Passport builder ===

describe("passport-builder", () => {
  it("builds passport from draft with data", () => {
    const base = seedBaseTransition();
    const draft = store.create(1);
    applyBaseTransitionToDraft(draft.id, base, store);
    store.setField(draft.id, makeField("gnb_number", "ЗП № 5-5"));
    store.setField(draft.id, makeField("address", "г. Москва, Огородный д.11"));

    const loaded = store.get(draft.id)!;
    const passport = buildPassportSummary(loaded);

    expect(passport.identity.customer).toBe("Крафт");
    expect(passport.identity.gnb_number).toBe("ЗП № 5-5");
    expect(passport.geometry.address).toBe("г. Москва, Огородный д.11");
    expect(passport.signatories.tech?.full_name).toBe("Гайдуков Н.И.");
    expect(passport.pipe.mark).toContain("ЭЛЕКТРОПАЙП");
    expect(passport.meta.base_transition_id).toBe("kraft-marino-3");
  });

  it("hasExecutiveSchemeSource returns false for empty draft", () => {
    const draft = store.create(1);
    expect(hasExecutiveSchemeSource(store.get(draft.id)!)).toBe(false);
  });

  it("hasExecutiveSchemeSource returns true when scheme added", () => {
    const draft = store.create(1);
    store.addSource(draft.id, {
      source_id: "s1",
      source_type: "pdf",
      doc_class: "executive_scheme",
      received_at: new Date().toISOString(),
      parse_status: "parsed",
    });
    expect(hasExecutiveSchemeSource(store.get(draft.id)!)).toBe(true);
  });

  it("requiresGeometryManualInput when no scheme and no profile_length", () => {
    const draft = store.create(1);
    expect(requiresGeometryManualInput(store.get(draft.id)!)).toBe(true);
  });

  it("requiresGeometryManualInput false when scheme present", () => {
    const draft = store.create(1);
    store.addSource(draft.id, {
      source_id: "s1",
      source_type: "pdf",
      doc_class: "executive_scheme",
      received_at: new Date().toISOString(),
      parse_status: "parsed",
    });
    expect(requiresGeometryManualInput(store.get(draft.id)!)).toBe(false);
  });
});

// === Review builder ===

describe("review-builder", () => {
  it("buildReviewReport with base transition", () => {
    const base = seedBaseTransition();
    const draft = store.create(1);
    applyBaseTransitionToDraft(draft.id, base, store);
    store.setField(draft.id, makeField("gnb_number", "ЗП № 5-5"));
    store.setField(draft.id, makeField("gnb_number_short", "5-5"));
    store.setField(draft.id, makeField("start_date", { day: 10, month: "декабря", year: 2025 }));
    store.setField(draft.id, makeField("end_date", { day: 22, month: "декабря", year: 2025 }));
    store.setField(draft.id, makeField("address", "г. Москва, Огородный д.11"));
    store.setField(draft.id, makeField("gnb_params.profile_length", 194.67));

    const loaded = store.get(draft.id)!;
    const report = buildReviewReport(loaded, base);

    // Inherited
    expect(report.inherited.length).toBeGreaterThan(5);
    expect(report.inherited.some((f) => f.field_name === "organizations.customer")).toBe(true);

    // Needs attention (semi-stable inherited without confirmation)
    expect(report.needs_attention.length).toBeGreaterThan(0);
    expect(report.needs_attention.some((f) => f.field_name === "signatories.tech_supervisor")).toBe(true);

    // Missing (desired fields)
    expect(report.missing.some((m) => m.field_name === "gnb_params.plan_length")).toBe(true);

    // Passport populated
    expect(report.passport.identity.gnb_number).toBe("ЗП № 5-5");
    expect(report.passport.geometry.profile_length).toBe(194.67);
  });

  it("buildReviewReport without base (from scratch)", () => {
    const draft = store.create(1);
    store.setField(draft.id, makeField("customer", "Крафт"));
    store.setField(draft.id, makeField("gnb_number", "ЗП № 1"));

    const loaded = store.get(draft.id)!;
    const report = buildReviewReport(loaded);

    expect(report.inherited).toHaveLength(0);
    expect(report.missing.length).toBeGreaterThan(5); // many required fields missing
    expect(report.ready_for_confirmation).toBe(false);
  });

  it("ready_for_confirmation true when all required present and no conflicts", () => {
    const base = seedBaseTransition();
    const draft = store.create(1);
    applyBaseTransitionToDraft(draft.id, base, store);

    // Set all volatile required fields
    store.setField(draft.id, makeField("gnb_number", "ЗП № 5-5"));
    store.setField(draft.id, makeField("gnb_number_short", "5-5"));
    store.setField(draft.id, makeField("start_date", { day: 10, month: "декабря", year: 2025 }));
    store.setField(draft.id, makeField("end_date", { day: 22, month: "декабря", year: 2025 }));
    store.setField(draft.id, makeField("address", "г. Москва, Огородный д.11"));
    store.setField(draft.id, makeField("gnb_params.profile_length", 194.67));

    const loaded = store.get(draft.id)!;
    const report = buildReviewReport(loaded, base);

    // All required fields present, no conflicts
    const requiredMissing = report.missing.filter((m) => m.required);
    expect(requiredMissing).toHaveLength(0);
    expect(report.conflicts).toHaveLength(0);
    expect(report.ready_for_confirmation).toBe(true);
  });

  it("scheme requirement appears in missing when no scheme and no profile", () => {
    const draft = store.create(1);
    const loaded = store.get(draft.id)!;
    const report = buildReviewReport(loaded);

    const schemeMissing = report.missing.find(
      (m) => m.field_name === "gnb_params.profile_length" && m.required,
    );
    expect(schemeMissing).toBeDefined();
  });
});

// === P1 fix: changed fields detection ===

describe("changed-fields detection", () => {
  it("reports changed field when override differs from base value", () => {
    const base = seedBaseTransition();
    const draft = store.create(1);
    applyBaseTransitionToDraft(draft.id, base, store);

    // Override project_number (semi-stable, inherited from base as "ШФ-123")
    store.setField(draft.id, makeField("project_number", "ШФ-456", { source_type: "manual_text", source_id: "manual" }));

    const loaded = store.get(draft.id)!;
    const report = buildReviewReport(loaded, base);

    const projChanged = report.changed.find((c) => c.field_name === "project_number");
    expect(projChanged).toBeDefined();
    expect(projChanged!.old_value).toBe("ШФ-123");
    expect(projChanged!.new_value).toBe("ШФ-456");
  });

  it("does NOT report changed for volatile fields (expected to differ)", () => {
    const base = seedBaseTransition();
    const draft = store.create(1);
    applyBaseTransitionToDraft(draft.id, base, store);

    // Set volatile fields — these should not appear in changed
    store.setField(draft.id, makeField("gnb_number", "ЗП № 5-5"));
    store.setField(draft.id, makeField("address", "г. Москва, Новый адрес"));

    const loaded = store.get(draft.id)!;
    const report = buildReviewReport(loaded, base);

    expect(report.changed.find((c) => c.field_name === "gnb_number")).toBeUndefined();
    expect(report.changed.find((c) => c.field_name === "address")).toBeUndefined();
  });

  it("does NOT report changed when value matches base", () => {
    const base = seedBaseTransition();
    const draft = store.create(1);
    applyBaseTransitionToDraft(draft.id, base, store);

    // Override with same value — should not be in changed
    store.setField(draft.id, makeField("project_number", "ШФ-123", { source_type: "pdf", source_id: "new-pdf" }));

    const loaded = store.get(draft.id)!;
    const report = buildReviewReport(loaded, base);

    expect(report.changed.find((c) => c.field_name === "project_number")).toBeUndefined();
  });
});

// === P2 fix: semantic object comparison ===

describe("valuesMatch semantic comparison", () => {
  it("matches objects with different key order", () => {
    const a = { name: "АО «ОЭК»", inn: "123", ogrn: "456" };
    const b = { ogrn: "456", name: "АО «ОЭК»", inn: "123" };
    expect(valuesMatch(a, b)).toBe(true);
  });

  it("ignores undefined properties in comparison", () => {
    const a = { name: "АО «ОЭК»", phone: "123" };
    const b = { name: "АО «ОЭК»", phone: "123", extra: undefined };
    expect(valuesMatch(a, b)).toBe(true);
  });

  it("detects real difference in objects", () => {
    const a = { full_name: "Гайдуков Н.И.", position: "Главный специалист" };
    const b = { full_name: "Попов А.Д.", position: "Главный специалист" };
    expect(valuesMatch(a, b)).toBe(false);
  });

  it("string comparison is case-insensitive trimmed", () => {
    expect(valuesMatch("  Москва ", "москва")).toBe(true);
    expect(valuesMatch("Москва", "Питер")).toBe(false);
  });
});

// === Base summary ===

describe("summarizeBase", () => {
  it("summarizes signatories and orgs from base", () => {
    const base = seedBaseTransition();
    const summary = summarizeBase(base);

    expect(summary.signatories).toHaveLength(3); // sign1 + sign2 + tech (no sign3)
    expect(summary.signatories.find((s) => s.role === "Технадзор")?.full_name).toBe("Гайдуков Н.И.");
    expect(summary.orgs).toHaveLength(3);
    expect(summary.pipe?.mark).toContain("ЭЛЕКТРОПАЙП");
  });
});
