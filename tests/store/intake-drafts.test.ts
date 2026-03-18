/**
 * Tests for IntakeDraftStore — Phase 5.1 foundation.
 *
 * Coverage:
 * - CRUD (create, get, getByChatId, list, delete)
 * - Status management
 * - Source document tracking
 * - Field extraction with provenance
 * - Source priority / conflict resolution
 * - Owner override (manual_text)
 * - Confirmed field protection
 * - Completeness checks (required/desired)
 * - Conflict detection
 * - TTL expiry
 * - applyFieldToData sync
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { IntakeDraftStore } from "../../src/store/intake-drafts.js";
import type {
  ExtractedField,
  SourceDocument,
  FieldName,
  IntakeDraft,
} from "../../src/intake/intake-types.js";

let tmpDir: string;
let store: IntakeDraftStore;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "intake-test-"));
  store = new IntakeDraftStore(tmpDir);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// === Helpers ===

function makeField(
  fieldName: FieldName,
  value: unknown,
  opts: Partial<ExtractedField> = {},
): ExtractedField {
  return {
    field_name: fieldName,
    value,
    source_id: opts.source_id ?? "src-1",
    source_type: opts.source_type ?? "manual_text",
    confidence: opts.confidence ?? "high",
    confirmed_by_owner: opts.confirmed_by_owner ?? false,
    conflict_with_existing: opts.conflict_with_existing ?? false,
    notes: opts.notes,
  };
}

function makeSource(overrides: Partial<SourceDocument> = {}): SourceDocument {
  return {
    source_id: "src-1",
    source_type: "pdf",
    original_file_name: "test.pdf",
    doc_class: "unknown",
    received_at: new Date().toISOString(),
    parse_status: "parsed",
    ...overrides,
  };
}

// === CRUD ===

describe("IntakeDraftStore CRUD", () => {
  it("create and get", () => {
    const draft = store.create(12345);
    expect(draft.id).toMatch(/^intake-12345-/);
    expect(draft.chat_id).toBe(12345);
    expect(draft.status).toBe("collecting");
    expect(draft.sources).toEqual([]);
    expect(draft.fields).toEqual([]);
    expect(draft.data).toEqual({});

    const loaded = store.get(draft.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.chat_id).toBe(12345);
  });

  it("getByChatId returns active draft", () => {
    const draft = store.create(99);
    const found = store.getByChatId(99);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(draft.id);
  });

  it("getByChatId returns null for unknown chat", () => {
    expect(store.getByChatId(999)).toBeNull();
  });

  it("list returns all drafts", () => {
    store.create(1);
    store.create(2);
    expect(store.list()).toHaveLength(2);
  });

  it("delete removes draft", () => {
    const draft = store.create(1);
    store.delete(draft.id);
    expect(store.get(draft.id)).toBeNull();
    expect(store.list()).toHaveLength(0);
  });

  it("delete non-existent is safe", () => {
    expect(() => store.delete("nonexistent")).not.toThrow();
  });
});

// === Status ===

describe("Status management", () => {
  it("setStatus updates status", () => {
    const draft = store.create(1);
    store.setStatus(draft.id, "awaiting_confirmation");
    const loaded = store.get(draft.id)!;
    expect(loaded.status).toBe("awaiting_confirmation");
  });

  it("setStatus updates updated_at", () => {
    const draft = store.create(1);
    const before = draft.updated_at;
    // Small delay to ensure timestamp changes
    store.setStatus(draft.id, "ready");
    const loaded = store.get(draft.id)!;
    expect(loaded.updated_at).not.toBe(before);
  });

  it("setStatus throws for unknown draft", () => {
    expect(() => store.setStatus("x", "ready")).toThrow();
  });
});

// === Sources ===

describe("Source documents", () => {
  it("addSource appends source", () => {
    const draft = store.create(1);
    const src = makeSource({ source_id: "s1", doc_class: "passport_pipe" });
    store.addSource(draft.id, src);

    const loaded = store.get(draft.id)!;
    expect(loaded.sources).toHaveLength(1);
    expect(loaded.sources[0].doc_class).toBe("passport_pipe");
  });

  it("addSource allows multiple sources", () => {
    const draft = store.create(1);
    store.addSource(draft.id, makeSource({ source_id: "s1" }));
    store.addSource(draft.id, makeSource({ source_id: "s2" }));
    expect(store.get(draft.id)!.sources).toHaveLength(2);
  });
});

// === Fields ===

describe("Field extraction", () => {
  it("setField adds new field", () => {
    const draft = store.create(1);
    const result = store.setField(draft.id, makeField("customer", "Крафт"));
    expect(result).toEqual({ updated: true, conflict: false });

    const loaded = store.get(draft.id)!;
    expect(loaded.fields).toHaveLength(1);
    expect(loaded.fields[0].value).toBe("Крафт");
  });

  it("setField syncs to draft.data", () => {
    const draft = store.create(1);
    store.setField(draft.id, makeField("customer", "Крафт"));
    store.setField(draft.id, makeField("address", "г. Москва, Огородный д.11"));

    const loaded = store.get(draft.id)!;
    expect(loaded.data.customer).toBe("Крафт");
    expect(loaded.data.address).toBe("г. Москва, Огородный д.11");
  });

  it("setField syncs nested fields (organizations)", () => {
    const draft = store.create(1);
    const org = { id: "oek", name: "АО «ОЭК»", ogrn: "123", inn: "456", legal_address: "", phone: "", sro_name: "" };
    store.setField(draft.id, makeField("organizations.customer", org));

    const loaded = store.get(draft.id)!;
    expect(loaded.data.organizations?.customer).toEqual(org);
  });

  it("setField syncs nested fields (signatories)", () => {
    const draft = store.create(1);
    const sig = { person_id: "test", role: "tech", org_description: "ОЭК", position: "Спец", full_name: "Тест И.И.", aosr_full_line: "test" };
    store.setField(draft.id, makeField("signatories.tech_supervisor", sig));

    const loaded = store.get(draft.id)!;
    expect(loaded.data.signatories?.tech_supervisor).toEqual(sig);
  });

  it("setField syncs nested fields (gnb_params)", () => {
    const draft = store.create(1);
    store.setField(draft.id, makeField("gnb_params.profile_length", 194.67));
    store.setField(draft.id, makeField("gnb_params.plan_length", 190.22));

    const loaded = store.get(draft.id)!;
    expect(loaded.data.gnb_params?.profile_length).toBe(194.67);
    expect(loaded.data.gnb_params?.plan_length).toBe(190.22);
  });

  it("setField merges pipe with _merge flag (does not overwrite)", () => {
    const draft = store.create(1);
    // First: pipe from prior_act
    store.setField(draft.id, makeField("pipe", { mark: "ЭЛЕКТРОПАЙП 225/170", diameter: "d=225", diameter_mm: 225, quality_passport: "№13043" }, { source_type: "prior_act", source_id: "s1" }));
    // Second: passport extraction with _merge — higher priority (pdf=4 > prior_act... no, prior_act=3 < pdf=4)
    // Use manual_text override to ensure the merge gets applied
    store.setField(draft.id, makeField("pipe", { _merge: true, mark: "ЭЛЕКТРОПАЙП 225/170-N 1250" }, { source_type: "manual_text", source_id: "s2" }));

    const loaded = store.get(draft.id)!;
    // Mark updated, but diameter and quality_passport preserved
    expect(loaded.data.pipe?.mark).toBe("ЭЛЕКТРОПАЙП 225/170-N 1250");
    expect(loaded.data.pipe?.diameter).toBe("d=225");
    expect(loaded.data.pipe?.diameter_mm).toBe(225);
    expect((loaded.data.pipe as any)?.quality_passport).toBe("№13043");
  });

  it("setField sets full pipe without _merge flag", () => {
    const draft = store.create(1);
    store.setField(draft.id, makeField("pipe", { mark: "Old", diameter: "d=160", diameter_mm: 160 }));
    store.setField(draft.id, makeField("pipe", { mark: "New", diameter: "d=225", diameter_mm: 225 }, { source_type: "manual_text", source_id: "s2" }));

    const loaded = store.get(draft.id)!;
    // Full overwrite — no _merge flag
    expect(loaded.data.pipe?.mark).toBe("New");
    expect(loaded.data.pipe?.diameter_mm).toBe(225);
  });

  it("setField syncs date fields", () => {
    const draft = store.create(1);
    const date = { day: 10, month: "декабря", year: 2025 };
    store.setField(draft.id, makeField("start_date", date));

    const loaded = store.get(draft.id)!;
    expect(loaded.data.start_date).toEqual(date);
  });
});

// === Priority & Conflicts ===

describe("Source priority and conflicts", () => {
  it("higher-priority source overwrites lower", () => {
    const draft = store.create(1);
    // First: memory (priority 6)
    store.setField(draft.id, makeField("customer", "Old", { source_type: "memory", source_id: "s1" }));
    // Then: pdf (priority 4) — should overwrite
    const result = store.setField(draft.id, makeField("customer", "New", { source_type: "pdf", source_id: "s2" }));

    expect(result).toEqual({ updated: true, conflict: false });
    const loaded = store.get(draft.id)!;
    expect(loaded.data.customer).toBe("New");
  });

  it("lower-priority source creates conflict", () => {
    const draft = store.create(1);
    // First: pdf (priority 4)
    store.setField(draft.id, makeField("customer", "FromPDF", { source_type: "pdf", source_id: "s1" }));
    // Then: memory (priority 6) — should NOT overwrite
    const result = store.setField(draft.id, makeField("customer", "FromMemory", { source_type: "memory", source_id: "s2" }));

    expect(result).toEqual({ updated: false, conflict: true });
    const loaded = store.get(draft.id)!;
    expect(loaded.data.customer).toBe("FromPDF"); // unchanged
    expect(loaded.fields).toHaveLength(2); // original + conflict candidate
  });

  it("manual_text always wins (owner override)", () => {
    const draft = store.create(1);
    // First: pdf
    store.setField(draft.id, makeField("customer", "FromPDF", { source_type: "pdf", source_id: "s1" }));
    // Then: manual override
    const result = store.setField(draft.id, makeField("customer", "Manual", { source_type: "manual_text", source_id: "s2" }));

    expect(result).toEqual({ updated: true, conflict: false });
    expect(store.get(draft.id)!.data.customer).toBe("Manual");
  });

  it("confirmed field cannot be overwritten by non-manual source", () => {
    const draft = store.create(1);
    store.setField(draft.id, makeField("customer", "Confirmed", { source_type: "pdf", source_id: "s1" }));
    store.confirmField(draft.id, "customer");

    // Try to overwrite with another pdf
    const result = store.setField(draft.id, makeField("customer", "Other", { source_type: "pdf", source_id: "s2" }));

    expect(result).toEqual({ updated: false, conflict: true });
    expect(store.get(draft.id)!.data.customer).toBe("Confirmed");
  });

  it("organization with ОГРН/ИНН is not overwritten by shorter abbreviation at same priority (Bug 3)", () => {
    const draft = store.create(1);
    // First: АОСР gives full org with ОГРН
    const fullOrg = {
      id: "oek",
      name: 'АО «Объединенная энергетическая компания» ОГРН 1057746394155, ИНН 7720522853, г. Москва',
      short_name: "АО «ОЭК»",
      ogrn: "1057746394155",
      inn: "7720522853",
      legal_address: "115035, г. Москва, Раушская наб., д.8",
    };
    store.setField(draft.id, makeField("organizations.customer", fullOrg, { source_type: "prior_act", source_id: "s1" }));

    // Then: Excel gives short version at same priority (prior_act = 3, excel = 3)
    const shortOrg = { name: 'АО "ОЭК"', short_name: 'АО "ОЭК"' };
    const result = store.setField(draft.id, makeField("organizations.customer", shortOrg, { source_type: "excel", source_id: "s2" }));

    // Should NOT overwrite — the full org has richer legal details
    expect(result).toEqual({ updated: false, conflict: false });
    const loaded = store.get(draft.id)!;
    const orgField = loaded.fields.find((f) => f.field_name === "organizations.customer" && !f.conflict_with_existing);
    expect((orgField?.value as any).ogrn).toBe("1057746394155");
  });

  it("organization field IS overwritten when new value has richer details", () => {
    const draft = store.create(1);
    // First: Excel gives short version
    const shortOrg = { name: 'АО "ОЭК"', short_name: 'АО "ОЭК"' };
    store.setField(draft.id, makeField("organizations.customer", shortOrg, { source_type: "excel", source_id: "s1" }));

    // Then: prior_act gives full org (same priority level)
    const fullOrg = {
      name: 'АО «Объединенная энергетическая компания»',
      short_name: "АО «ОЭК»",
      ogrn: "1057746394155",
      inn: "7720522853",
    };
    const result = store.setField(draft.id, makeField("organizations.customer", fullOrg, { source_type: "prior_act", source_id: "s2" }));

    // Should overwrite — the new value has richer details
    expect(result).toEqual({ updated: true, conflict: false });
    const loaded = store.get(draft.id)!;
    const orgField = loaded.fields.find((f) => f.field_name === "organizations.customer" && !f.conflict_with_existing);
    expect((orgField?.value as any).ogrn).toBe("1057746394155");
  });

  it("confirmed field CAN be overwritten by manual_text", () => {
    const draft = store.create(1);
    store.setField(draft.id, makeField("customer", "Confirmed", { source_type: "pdf", source_id: "s1" }));
    store.confirmField(draft.id, "customer");

    const result = store.setField(draft.id, makeField("customer", "Override", { source_type: "manual_text", source_id: "s2" }));
    expect(result).toEqual({ updated: true, conflict: false });
    expect(store.get(draft.id)!.data.customer).toBe("Override");
  });
});

// === Confirm ===

describe("Field confirmation", () => {
  it("confirmField marks field as confirmed", () => {
    const draft = store.create(1);
    store.setField(draft.id, makeField("customer", "Крафт"));
    store.confirmField(draft.id, "customer");

    const field = store.getField(draft.id, "customer");
    expect(field?.confirmed_by_owner).toBe(true);
  });

  it("getField returns active (non-conflict) field", () => {
    const draft = store.create(1);
    store.setField(draft.id, makeField("customer", "Active", { source_type: "pdf", source_id: "s1" }));
    store.setField(draft.id, makeField("customer", "Conflict", { source_type: "memory", source_id: "s2" }));

    const field = store.getField(draft.id, "customer");
    expect(field?.value).toBe("Active");
  });

  it("getConflicts returns conflict candidates", () => {
    const draft = store.create(1);
    store.setField(draft.id, makeField("customer", "Active", { source_type: "pdf", source_id: "s1" }));
    store.setField(draft.id, makeField("customer", "Conflict", { source_type: "memory", source_id: "s2" }));

    const conflicts = store.getConflicts(draft.id, "customer");
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].value).toBe("Conflict");
  });
});

// === Completeness ===

describe("Completeness checks", () => {
  it("getMissingRequired returns all required when empty", () => {
    const draft = store.create(1);
    const missing = store.getMissingRequired(draft.id);
    expect(missing.length).toBeGreaterThan(0);
    expect(missing).toContain("customer");
    expect(missing).toContain("gnb_number");
    expect(missing).toContain("organizations.customer");
  });

  it("getMissingRequired shrinks as fields are added", () => {
    const draft = store.create(1);
    const allMissing = store.getMissingRequired(draft.id);

    store.setField(draft.id, makeField("customer", "Крафт"));
    store.setField(draft.id, makeField("gnb_number", "ЗП № 5-5"));

    const nowMissing = store.getMissingRequired(draft.id);
    expect(nowMissing.length).toBe(allMissing.length - 2);
    expect(nowMissing).not.toContain("customer");
    expect(nowMissing).not.toContain("gnb_number");
  });

  it("getMissingDesired works", () => {
    const draft = store.create(1);
    const missing = store.getMissingDesired(draft.id);
    expect(missing).toContain("project_number");
    expect(missing).toContain("pipe");
  });

  it("hasConflicts returns true when conflicts exist", () => {
    const draft = store.create(1);
    expect(store.hasConflicts(draft.id)).toBe(false);

    store.setField(draft.id, makeField("customer", "A", { source_type: "pdf", source_id: "s1" }));
    store.setField(draft.id, makeField("customer", "B", { source_type: "memory", source_id: "s2" }));

    expect(store.hasConflicts(draft.id)).toBe(true);
  });
});

// === TTL ===

describe("TTL expiry", () => {
  it("expireOld removes old drafts", () => {
    const draft = store.create(1);
    // Manually set updated_at to 8 days ago
    const loaded = store.get(draft.id)!;
    loaded.updated_at = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const filePath = path.join(tmpDir, "intake-drafts", `${draft.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(loaded));

    const expired = store.expireOld();
    expect(expired).toBe(1);
    expect(store.list()).toHaveLength(0);
  });

  it("expireOld keeps fresh drafts", () => {
    store.create(1);
    const expired = store.expireOld();
    expect(expired).toBe(0);
    expect(store.list()).toHaveLength(1);
  });
});

// === Edge cases ===

describe("Edge cases", () => {
  it("setField on non-existent draft throws", () => {
    expect(() => store.setField("x", makeField("customer", "test"))).toThrow();
  });

  it("getField on non-existent draft returns null", () => {
    expect(store.getField("x", "customer")).toBeNull();
  });

  it("getMissingRequired on non-existent draft returns empty", () => {
    expect(store.getMissingRequired("x")).toEqual([]);
  });

  it("multiple fields accumulate in data", () => {
    const draft = store.create(1);
    store.setField(draft.id, makeField("customer", "Крафт"));
    store.setField(draft.id, makeField("object", "Марьино"));
    store.setField(draft.id, makeField("gnb_number", "ЗП № 5-5"));
    store.setField(draft.id, makeField("gnb_number_short", "5-5"));
    store.setField(draft.id, makeField("address", "г. Москва"));

    const loaded = store.get(draft.id)!;
    expect(loaded.data.customer).toBe("Крафт");
    expect(loaded.data.object).toBe("Марьино");
    expect(loaded.data.gnb_number).toBe("ЗП № 5-5");
    expect(loaded.data.gnb_number_short).toBe("5-5");
    expect(loaded.data.address).toBe("г. Москва");
    expect(loaded.fields).toHaveLength(5);
  });
});
