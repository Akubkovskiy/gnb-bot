/**
 * Tests for reasoning orchestrator — Phase 4.
 */

import { describe, it, expect } from "vitest";
import { extractMentionedNames } from "../../src/db/reasoning.js";

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
