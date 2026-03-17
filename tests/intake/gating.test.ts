/**
 * Tests for reasoning call gating — Block A.
 */

import { describe, it, expect } from "vitest";
import { shouldUseReasoning } from "../../src/intake/reasoning-handler.js";

describe("shouldUseReasoning", () => {
  // === Fast-path: NO Claude needed ===

  it("skips Claude for short confirmations", () => {
    expect(shouldUseReasoning("да", 0)).toBe(false);
    expect(shouldUseReasoning("нет", 0)).toBe(false);
    expect(shouldUseReasoning("ок", 0)).toBe(false);
    expect(shouldUseReasoning("подтвердить", 0)).toBe(false);
    expect(shouldUseReasoning("отмена", 0)).toBe(false);
    expect(shouldUseReasoning("пропустить", 0)).toBe(false);
  });

  it("skips Claude when regex found enough fields", () => {
    expect(shouldUseReasoning("даты 10.12.2025 - 22.12.2025 адрес Огородный д.11", 3)).toBe(false);
    expect(shouldUseReasoning("Lпроф 194.67 Lплан 190.22", 2)).toBe(false);
  });

  it("skips Claude for very short non-name text", () => {
    expect(shouldUseReasoning("привет", 0)).toBe(false);
    expect(shouldUseReasoning("ок спасибо", 0)).toBe(false);
  });

  // === Claude needed ===

  it("calls Claude for single surname (potential signatory)", () => {
    expect(shouldUseReasoning("Гайдуков", 0)).toBe(true);
    expect(shouldUseReasoning("Щеглов", 0)).toBe(true);
  });

  it("calls Claude for signatory assignment text", () => {
    expect(shouldUseReasoning("технадзор Гайдуков", 0)).toBe(true);
    expect(shouldUseReasoning("мастер Коробков", 0)).toBe(true);
    expect(shouldUseReasoning("подрядчик от Специнжа Щеглов", 0)).toBe(true);
  });

  it("calls Claude for lookup queries", () => {
    expect(shouldUseReasoning("что у нас по Гайдукову?", 0)).toBe(true);
    expect(shouldUseReasoning("какие паспорта были?", 0)).toBe(true);
    expect(shouldUseReasoning("покажи документы по объекту", 0)).toBe(true);
  });

  it("calls Claude for reuse requests", () => {
    expect(shouldUseReasoning("возьми как в прошлом переходе", 0)).toBe(true);
    expect(shouldUseReasoning("используй тот же паспорт", 0)).toBe(true);
  });

  it("calls Claude for absence declarations", () => {
    expect(shouldUseReasoning("Стройтреста нет", 0)).toBe(true);
  });

  it("calls Claude for natural free text with names", () => {
    expect(shouldUseReasoning("Мастер по ЭРС СВРЭС АО «ОЭК» Акимов Ю.О.", 0)).toBe(true);
    expect(shouldUseReasoning("на этом объекте технадзор Гайдуков, мастер Коробков", 0)).toBe(true);
  });

  it("calls Claude for medium-length text with low regex yield", () => {
    expect(shouldUseReasoning("Объект: Резервирование электроснабжения РП 70046", 0)).toBe(true);
  });
});
