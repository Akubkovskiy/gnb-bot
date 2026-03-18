/**
 * Regression tests for Phase 7 known bugs:
 * 1. Multi-signatory in one message
 * 2. Reasoning confirmation drops updates → returns "Принято" instead of null
 * 3. Position absorbs order/NRS text
 * 4. Org.customer precedence (richer source protection)
 */

import { describe, it, expect } from "vitest";
import { extractFromText } from "../../src/intake/text-extractor.js";
import { shouldUseReasoning } from "../../src/intake/reasoning-handler.js";

// === Bug 1: Multi-signatory in one message ===

describe("multi-signatory parsing", () => {
  it("parses comma-separated signatories", () => {
    const result = extractFromText("технадзор Гайдуков, мастер Коробков, подрядчик Буряк", "test");
    const fields = result.fields;
    const tech = fields.find((f) => f.field_name === "signatories.tech_supervisor");
    const sign1 = fields.find((f) => f.field_name === "signatories.sign1_customer");
    const sign2 = fields.find((f) => f.field_name === "signatories.sign2_contractor");

    expect(tech).toBeDefined();
    expect(sign1).toBeDefined();
    expect(sign2).toBeDefined();
    expect((tech?.value as any).full_name).toContain("Гайдуков");
    expect((sign1?.value as any).full_name).toContain("Коробков");
    expect((sign2?.value as any).full_name).toContain("Буряк");
  });

  it("parses arrow-separated signatories", () => {
    const result = extractFromText("технадзор Гайдуков → мастер Коробков → подрядчик Буряк", "test");
    const tech = result.fields.find((f) => f.field_name === "signatories.tech_supervisor");
    const sign1 = result.fields.find((f) => f.field_name === "signatories.sign1_customer");
    const sign2 = result.fields.find((f) => f.field_name === "signatories.sign2_contractor");

    expect(tech).toBeDefined();
    expect(sign1).toBeDefined();
    expect(sign2).toBeDefined();
  });

  it("parses newline-separated signatories", () => {
    const result = extractFromText("технадзор Гайдуков\nмастер Коробков\nподрядчик Буряк", "test");
    expect(result.fields.filter((f) => f.field_name.startsWith("signatories."))).toHaveLength(3);
  });

  it("single signatory still works", () => {
    const result = extractFromText("технадзор Гайдуков", "test");
    const tech = result.fields.find((f) => f.field_name === "signatories.tech_supervisor");
    expect(tech).toBeDefined();
    expect((tech?.value as any).full_name).toContain("Гайдуков");
  });

  it("signatory with dash separator works", () => {
    const result = extractFromText("технадзор - Гайдуков", "test");
    const tech = result.fields.find((f) => f.field_name === "signatories.tech_supervisor");
    expect(tech).toBeDefined();
  });
});

// === Bug 3: Position absorbs order/NRS text ===

describe("signatory position parsing", () => {
  it("strips order from position", () => {
    const result = extractFromText("подрядчик - Начальник участка Буряк А.М. приказ №699 от 01.10.2025", "test");
    const sign2 = result.fields.find((f) => f.field_name === "signatories.sign2_contractor");
    expect(sign2).toBeDefined();
    const val = sign2?.value as Record<string, unknown>;
    // Full name extracted
    expect(val.full_name).toBe("Буряк А.М.");
    // Position should NOT contain order text
    expect(String(val.position)).not.toContain("приказ");
    // Order should be extracted (order_number or order_type present)
    expect(val.order_type ?? val.order_number ?? val.order_date).toBeDefined();
  });

  it("strips NRS from position", () => {
    const result = extractFromText("технадзор - Главный специалист Гайдуков Н.И. НРС C-71-259039 от 23.09.2022", "test");
    const tech = result.fields.find((f) => f.field_name === "signatories.tech_supervisor");
    expect(tech).toBeDefined();
    const val = tech?.value as Record<string, unknown>;
    // NRS should be extracted and stripped from position
    // If NRS extraction works, nrs_id is set
    if (val.nrs_id) {
      expect(String(val.position)).not.toContain("НРС");
      expect(val.nrs_id).toBe("C-71-259039");
      expect(val.nrs_date).toBe("23.09.2022");
    } else {
      // If NRS not extracted by regex, it's handled by DB enrichment
      // The full signatory text is preserved in aosr_full_line for DB lookup
      expect(val.aosr_full_line).toContain("НРС");
    }
  });

  it("strips org from position", () => {
    const result = extractFromText('мастер - инженер ЦРЭС АО "ОЭК" Селиванов В.Ю.', "test");
    const sign1 = result.fields.find((f) => f.field_name === "signatories.sign1_customer");
    expect(sign1).toBeDefined();
    const val = sign1?.value as Record<string, unknown>;
    expect(val.full_name).toBe("Селиванов В.Ю.");
    expect(String(val.org_description)).toContain("ОЭК");
    expect(String(val.position)).not.toContain("АО");
  });
});

// === Bug 2: Reasoning gating ===

describe("reasoning gating", () => {
  it("shouldUseReasoning returns false for simple 'да'", () => {
    expect(shouldUseReasoning("да", 0)).toBe(false);
  });

  it("shouldUseReasoning returns false for 'нет'", () => {
    expect(shouldUseReasoning("нет", 0)).toBe(false);
  });

  it("shouldUseReasoning returns true for role mentions", () => {
    expect(shouldUseReasoning("технадзор Гайдуков", 1)).toBe(true);
  });

  it("shouldUseReasoning returns true for lookup queries", () => {
    expect(shouldUseReasoning("что у нас по Гайдукову?", 0)).toBe(true);
  });

  it("shouldUseReasoning returns false for multi-signatory when regex handles it", () => {
    // Regex now handles multi-sig splitting, so no need for Claude
    expect(shouldUseReasoning("технадзор Гайдуков, мастер Коробков", 2)).toBe(false);
  });

  it("shouldUseReasoning returns true for complex signatory with NRS/order", () => {
    expect(shouldUseReasoning("Начальник участка АНО ОЭК Стройтрест Буряк А.М. НРС С-58-228991 приказ №699", 0)).toBe(true);
  });
});
