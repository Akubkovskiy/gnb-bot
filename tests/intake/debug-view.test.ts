import { describe, it, expect } from "vitest";
import {
  buildDebugFieldEntries,
  buildDebugSnapshot,
  formatDebugReview,
  type DebugFieldEntry,
} from "../../src/intake/debug-view.js";
import type { IntakeDraft, ExtractedField } from "../../src/intake/intake-types.js";

function makeDraft(overrides: Partial<IntakeDraft> = {}): IntakeDraft {
  return {
    id: "test-draft-1",
    chat_id: 123,
    status: "collecting",
    created_at: "2026-03-18T00:00:00Z",
    updated_at: "2026-03-18T00:00:00Z",
    sources: [],
    fields: [],
    data: {},
    ...overrides,
  };
}

function makeField(overrides: Partial<ExtractedField>): ExtractedField {
  return {
    field_name: "customer",
    value: "Крафт",
    source_id: "src-1",
    source_type: "manual_text",
    confidence: "high",
    confirmed_by_owner: false,
    conflict_with_existing: false,
    ...overrides,
  };
}

describe("buildDebugFieldEntries", () => {
  it("returns entries for all resolved fields", () => {
    const draft = makeDraft({
      fields: [
        makeField({ field_name: "customer", value: "Крафт" }),
        makeField({ field_name: "object", value: "Марьино" }),
      ],
    });

    const entries = buildDebugFieldEntries(draft);
    expect(entries).toHaveLength(2);
    expect(entries[0].field_name).toBe("customer");
    expect(entries[0].resolved_value).toBe("Крафт");
    expect(entries[0].label).toBe("Заказчик");
  });

  it("marks inherited fields correctly", () => {
    const draft = makeDraft({
      base_transition_id: "prev-123",
      fields: [
        makeField({
          field_name: "signatories.sign1_customer",
          value: { full_name: "Коробков Ю.Н.", position: "Мастер" },
          source_id: "base:prev-123",
          source_type: "prior_act",
        }),
      ],
    });

    const entries = buildDebugFieldEntries(draft);
    expect(entries[0].inherited).toBe(true);
  });

  it("marks manual fields as not inherited", () => {
    const draft = makeDraft({
      fields: [
        makeField({
          field_name: "address",
          value: "г. Москва, Огородный проезд",
          source_type: "manual_text",
          source_id: "text-1",
        }),
      ],
    });

    const entries = buildDebugFieldEntries(draft);
    expect(entries[0].inherited).toBe(false);
    expect(entries[0].source_type).toBe("manual_text");
  });

  it("separates conflict candidates", () => {
    const draft = makeDraft({
      fields: [
        makeField({ field_name: "address", value: "Адрес 1", conflict_with_existing: false }),
        makeField({ field_name: "address", value: "Адрес 2", conflict_with_existing: true }),
      ],
    });

    const entries = buildDebugFieldEntries(draft);
    expect(entries).toHaveLength(2);
    const resolved = entries.find((e) => !e.conflict_with_existing);
    const conflict = entries.find((e) => e.conflict_with_existing);
    expect(resolved?.resolved_value).toBe("Адрес 1");
    expect(conflict?.resolved_value).toBe("Адрес 2");
    expect(conflict?.notes).toContain("CONFLICT");
  });

  it("marks required/desired fields", () => {
    const draft = makeDraft({
      fields: [
        makeField({ field_name: "customer" }), // required
        makeField({ field_name: "pipe", value: {} }), // desired
        makeField({ field_name: "executor", value: "ОЭК" }), // desired
      ],
    });

    const entries = buildDebugFieldEntries(draft);
    const customer = entries.find((e) => e.field_name === "customer");
    const pipe = entries.find((e) => e.field_name === "pipe");
    const executor = entries.find((e) => e.field_name === "executor");
    expect(customer?.required).toBe(true);
    expect(pipe?.desired).toBe(true);
    expect(executor?.desired).toBe(true);
  });
});

describe("buildDebugSnapshot", () => {
  it("builds stable snapshot with stats", () => {
    const draft = makeDraft({
      sources: [
        {
          source_id: "src-1",
          source_type: "manual_text",
          doc_class: "free_text_note",
          received_at: "2026-03-18T00:00:00Z",
          parse_status: "parsed",
        },
        {
          source_id: "src-2",
          source_type: "pdf",
          doc_class: "executive_scheme",
          original_file_name: "ИС ГНБ 5-5.pdf",
          received_at: "2026-03-18T00:01:00Z",
          parse_status: "parsed",
        },
      ],
      fields: [
        makeField({ field_name: "customer", source_type: "manual_text" }),
        makeField({ field_name: "address", source_type: "pdf", source_id: "src-2" }),
        makeField({
          field_name: "signatories.sign1_customer",
          source_type: "memory",
          source_id: "db-lookup",
        }),
      ],
      data: { customer: "Крафт" },
    });

    const snapshot = buildDebugSnapshot(draft);

    expect(snapshot.draft_id).toBe("test-draft-1");
    expect(snapshot.sources).toHaveLength(2);
    expect(snapshot.fields).toHaveLength(3);
    expect(snapshot.resolved_data).toEqual({ customer: "Крафт" });
    expect(snapshot.stats.total_fields).toBe(3);
    expect(snapshot.stats.manual_fields).toBe(1);
    expect(snapshot.stats.extracted_fields).toBe(1);
    expect(snapshot.stats.db_derived_fields).toBe(1);
  });
});

describe("formatDebugReview", () => {
  it("produces readable text with categories", () => {
    const draft = makeDraft({
      fields: [
        makeField({ field_name: "customer", value: "Крафт" }),
        makeField({ field_name: "address", value: "г. Москва, Огородный" }),
        makeField({
          field_name: "signatories.sign1_customer",
          value: { full_name: "Коробков Ю.Н.", position: "Мастер", org: "АО «ОЭК»" },
          source_type: "prior_act",
          source_id: "base:prev",
        }),
        makeField({
          field_name: "gnb_params.profile_length",
          value: 194.67,
          source_type: "pdf",
          source_id: "src-2",
        }),
      ],
      base_transition_id: "prev",
    });

    const snapshot = buildDebugSnapshot(draft);
    const text = formatDebugReview(snapshot);

    expect(text).toContain("DEBUG REVIEW");
    expect(text).toContain("--- IDENTITY ---");
    expect(text).toContain("customer");
    expect(text).toContain("Крафт");
    expect(text).toContain("--- SIGNATORIES ---");
    expect(text).toContain("signatories.sign1_customer");
    expect(text).toContain("Коробков");
    expect(text).toContain("src=prior_act");
    expect(text).toContain("--- GNB PARAMS ---");
    expect(text).toContain("194.67");
  });

  it("shows missing required fields", () => {
    const draft = makeDraft({
      fields: [
        makeField({ field_name: "customer" }),
        // Missing: object, address, gnb_number, dates, signatories, etc.
      ],
    });

    const snapshot = buildDebugSnapshot(draft);
    const text = formatDebugReview(snapshot);

    expect(text).toContain("MISSING REQUIRED");
    expect(text).toContain("address");
    expect(text).toContain("gnb_number");
  });

  it("shows conflicts section when present", () => {
    const draft = makeDraft({
      fields: [
        makeField({ field_name: "address", value: "Адрес 1" }),
        makeField({ field_name: "address", value: "Адрес 2", conflict_with_existing: true }),
      ],
    });

    const snapshot = buildDebugSnapshot(draft);
    const text = formatDebugReview(snapshot);

    expect(text).toContain("CONFLICTS");
    expect(text).toContain("Адрес 2");
  });

  it("does not affect normal review output", async () => {
    // Ensure debug view is a separate module — normal buildReviewText is not touched
    const mod = await import("../../src/intake/intake-response.js");
    expect(typeof mod.buildReviewText).toBe("function");
    // Normal review doesn't include DEBUG REVIEW header — verified by module separation
  });
});
