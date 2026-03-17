/**
 * Tests for reasoning orchestrator — Phase 4.
 */

import { describe, it, expect } from "vitest";
import { extractMentionedNames } from "../../src/db/reasoning.js";
import type { IntakeReasoningOutput } from "../../src/db/reasoning-contracts.js";

describe("extractMentionedNames", () => {
  it("extracts surnames from text", () => {
    const names = extractMentionedNames("технадзор Гайдуков, мастер Коробков");
    expect(names).toContain("Гайдуков");
    expect(names).toContain("Коробков");
  });

  it("filters out common non-name words", () => {
    const names = extractMentionedNames("Технадзор Гайдуков от Москвы");
    expect(names).toContain("Гайдуков");
    expect(names).not.toContain("Технадзор");
    expect(names).not.toContain("Москвы");
  });

  it("handles absence declarations", () => {
    const names = extractMentionedNames("Стройтреста нет, технадзор Гайдуков");
    expect(names).toContain("Гайдуков");
    expect(names).not.toContain("Стройтреста");
  });

  it("returns empty for no names", () => {
    expect(extractMentionedNames("даты 10.12.2025 - 22.12.2025")).toHaveLength(0);
  });

  it("deduplicates names", () => {
    const names = extractMentionedNames("Гайдуков технадзор, Гайдуков ОТН");
    expect(names).toHaveLength(1);
  });
});

// === JSON parsing robustness ===

describe("reasoning output parsing", () => {
  it("parses valid JSON from Claude response", () => {
    const raw = `Some text before\n\n{"intent":"field_update","fieldUpdates":[{"fieldName":"address","value":"test","confidence":"high","source":"owner_text"}],"summary":"test"}\n\nSome text after`;
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    expect(jsonMatch).not.toBeNull();
    const parsed = JSON.parse(jsonMatch![0]) as IntakeReasoningOutput;
    expect(parsed.intent).toBe("field_update");
    expect(parsed.fieldUpdates).toHaveLength(1);
  });

  it("parses signatory-only response (no fieldUpdates)", () => {
    const raw = `{"intent":"signatory_assignment","fieldUpdates":[],"signatoryUpdates":[{"role":"tech","personId":"gaydukov","action":"assign"}],"summary":"Назначен технадзор"}`;
    const parsed = JSON.parse(raw) as IntakeReasoningOutput;
    expect(parsed.intent).toBe("signatory_assignment");
    expect(parsed.fieldUpdates).toHaveLength(0);
    expect(parsed.signatoryUpdates).toHaveLength(1);
    expect(parsed.signatoryUpdates![0].role).toBe("tech");
  });

  it("parses lookup_query response", () => {
    const raw = `{"intent":"lookup_query","fieldUpdates":[],"summary":"Гайдуков Н.И. — технадзор ОТН, распоряжение 01/3349-р"}`;
    const parsed = JSON.parse(raw) as IntakeReasoningOutput;
    expect(parsed.intent).toBe("lookup_query");
    expect(parsed.summary).toContain("Гайдуков");
  });

  it("parses absence_declaration", () => {
    const raw = `{"intent":"absence_declaration","fieldUpdates":[],"signatoryUpdates":[{"role":"sign3","personId":"","action":"remove"}],"summary":"Субподрядчик отсутствует"}`;
    const parsed = JSON.parse(raw) as IntakeReasoningOutput;
    expect(parsed.intent).toBe("absence_declaration");
    expect(parsed.signatoryUpdates![0].action).toBe("remove");
  });

  it("handles needs_manual for unknown person", () => {
    const raw = `{"intent":"signatory_assignment","fieldUpdates":[],"signatoryUpdates":[{"role":"sign1","personId":"","action":"needs_manual","newPersonData":{"fullName":"Иванов А.А.","position":"Мастер"}}],"questionsForOwner":["Иванов А.А. не найден в базе. Уточните: полные ФИО, должность, организация."],"summary":"Иванов не найден в базе"}`;
    const parsed = JSON.parse(raw) as IntakeReasoningOutput;
    expect(parsed.signatoryUpdates![0].action).toBe("needs_manual");
    expect(parsed.signatoryUpdates![0].newPersonData?.fullName).toBe("Иванов А.А.");
    expect(parsed.questionsForOwner).toHaveLength(1);
  });
});
