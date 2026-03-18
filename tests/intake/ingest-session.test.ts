/**
 * Tests for standalone knowledge ingest session management.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  getIngestSession,
  setIngestSession,
  clearIngestSession,
  hasActiveIngestSession,
  _resetAllIngestSessions,
  isSaveTrigger,
  handleIngestTextAnswer,
  buildQuestionsResponse,
  buildPersistedResponse,
  buildFailedResponse,
  type IngestSession,
} from "../../src/intake/ingest-session.js";
import type { KnowledgeIngestOutput } from "../../src/db/reasoning-contracts.js";

const CHAT_ID = 99999;

beforeEach(() => {
  _resetAllIngestSessions();
});

// === Trigger detection ===

describe("isSaveTrigger", () => {
  it("recognizes Russian triggers", () => {
    expect(isSaveTrigger("сохрани")).toBe(true);
    expect(isSaveTrigger("Сохрани")).toBe(true);
    expect(isSaveTrigger("сохрани данные")).toBe(true);
    expect(isSaveTrigger("СОХРАНИ ДАННЫЕ")).toBe(true);
    expect(isSaveTrigger("сохранить")).toBe(true);
    expect(isSaveTrigger("запомни")).toBe(true);
    expect(isSaveTrigger("запомни данные")).toBe(true);
    expect(isSaveTrigger("в базу")).toBe(true);
  });

  it("recognizes English triggers", () => {
    expect(isSaveTrigger("save data")).toBe(true);
    expect(isSaveTrigger("Save Data")).toBe(true);
    expect(isSaveTrigger("save")).toBe(true);
  });

  it("rejects non-triggers", () => {
    expect(isSaveTrigger("привет")).toBe(false);
    expect(isSaveTrigger("какие данные")).toBe(false);
    expect(isSaveTrigger("даты 10.12.2025")).toBe(false);
    expect(isSaveTrigger("")).toBe(false);
  });

  it("handles trigger as prefix", () => {
    expect(isSaveTrigger("сохрани это")).toBe(true);
    expect(isSaveTrigger("save this")).toBe(true);
  });
});

// === Session management ===

describe("ingest session CRUD", () => {
  it("returns null for no session", () => {
    expect(getIngestSession(CHAT_ID)).toBeNull();
  });

  it("creates and retrieves session", () => {
    const session: IngestSession = {
      state: "awaiting_link",
      startedAt: Date.now(),
    };
    setIngestSession(CHAT_ID, session);
    expect(getIngestSession(CHAT_ID)).toEqual(session);
  });

  it("clears session", () => {
    setIngestSession(CHAT_ID, { state: "awaiting_link", startedAt: Date.now() });
    clearIngestSession(CHAT_ID);
    expect(getIngestSession(CHAT_ID)).toBeNull();
  });

  it("hasActiveIngestSession returns true for awaiting_link", () => {
    setIngestSession(CHAT_ID, { state: "awaiting_link", startedAt: Date.now() });
    expect(hasActiveIngestSession(CHAT_ID)).toBe(true);
  });

  it("hasActiveIngestSession returns false for idle", () => {
    setIngestSession(CHAT_ID, { state: "idle", startedAt: Date.now() });
    expect(hasActiveIngestSession(CHAT_ID)).toBe(false);
  });

  it("hasActiveIngestSession returns false for done", () => {
    setIngestSession(CHAT_ID, { state: "done", startedAt: Date.now() });
    expect(hasActiveIngestSession(CHAT_ID)).toBe(false);
  });

  it("hasActiveIngestSession returns false when no session", () => {
    expect(hasActiveIngestSession(CHAT_ID)).toBe(false);
  });
});

// === Text answer handling ===

describe("handleIngestTextAnswer", () => {
  const makePendingResult = (): KnowledgeIngestOutput => ({
    docKind: "person_document",
    extractedData: { fullName: "Гайдуков Н.И.", docNumber: "01/3349-р" },
    suggestedLinks: { personId: "gaydukov", objectId: null, materialId: null, transitionId: null },
    missingLinks: ["objectId"],
    questionsForOwner: ["К какому объекту относится этот документ?"],
    summary: "Распоряжение ТН",
  });

  it("returns not updated when no session", () => {
    const result = handleIngestTextAnswer(CHAT_ID, "Марьино");
    expect(result.updated).toBe(false);
  });

  it("returns not updated when session is idle", () => {
    setIngestSession(CHAT_ID, { state: "idle", startedAt: Date.now() });
    const result = handleIngestTextAnswer(CHAT_ID, "Марьино");
    expect(result.updated).toBe(false);
  });

  it("handles cancel", () => {
    setIngestSession(CHAT_ID, {
      state: "awaiting_link",
      pendingResult: makePendingResult(),
      startedAt: Date.now(),
    });
    const result = handleIngestTextAnswer(CHAT_ID, "отмена");
    expect(result.updated).toBe(false);
    expect(getIngestSession(CHAT_ID)).toBeNull();
  });

  it("handles skip", () => {
    setIngestSession(CHAT_ID, {
      state: "awaiting_link",
      pendingResult: makePendingResult(),
      startedAt: Date.now(),
    });
    const result = handleIngestTextAnswer(CHAT_ID, "пропустить");
    expect(result.updated).toBe(true);
    expect(result.result).toBeDefined();
    expect(result.result!.missingLinks).toEqual([]);
    expect(result.result!.questionsForOwner).toEqual([]);
  });

  it("handles owner text answer", () => {
    setIngestSession(CHAT_ID, {
      state: "awaiting_link",
      pendingResult: makePendingResult(),
      startedAt: Date.now(),
    });
    const result = handleIngestTextAnswer(CHAT_ID, "Марьино");
    expect(result.updated).toBe(true);
    expect(result.result).toBeDefined();
    expect(result.result!.extractedData.ownerAnswer).toBe("Марьино");
    expect(result.result!.questionsForOwner).toEqual([]);
    expect(result.result!.missingLinks).toEqual([]);
  });
});

// === Response builders ===

describe("buildQuestionsResponse", () => {
  it("builds response with questions", () => {
    const result: KnowledgeIngestOutput = {
      docKind: "person_document",
      extractedData: {},
      suggestedLinks: { personId: "gaydukov", objectId: null, materialId: null, transitionId: null },
      missingLinks: ["objectId"],
      questionsForOwner: ["К какому объекту относится документ?"],
      summary: "Приказ о назначении",
    };
    const resp = buildQuestionsResponse(result);
    expect(resp.message).toContain("Приказ о назначении");
    expect(resp.message).toContain("К какому объекту относится документ?");
    expect(resp.buttons).toBeDefined();
    expect(resp.buttons!.length).toBeGreaterThan(0);
  });

  it("builds response with missing links only", () => {
    const result: KnowledgeIngestOutput = {
      docKind: "pipe_document",
      extractedData: {},
      suggestedLinks: { personId: null, objectId: null, materialId: null, transitionId: null },
      missingLinks: ["materialId", "objectId"],
      questionsForOwner: [],
      summary: "Паспорт трубы",
    };
    const resp = buildQuestionsResponse(result);
    expect(resp.message).toContain("Паспорт трубы");
    expect(resp.message).toContain("materialId");
    expect(resp.message).toContain("objectId");
  });
});

describe("buildPersistedResponse", () => {
  it("builds success response with links", () => {
    const resp = buildPersistedResponse("Паспорт трубы", "ingest-123", {
      personId: null,
      objectId: "kraft-marino",
      materialId: "pipe-ep-225",
      transitionId: null,
    });
    expect(resp.message).toContain("Сохранено");
    expect(resp.message).toContain("Паспорт трубы");
    expect(resp.message).toContain("ingest-123");
    expect(resp.message).toContain("объект: kraft-marino");
    expect(resp.message).toContain("материал: pipe-ep-225");
  });

  it("builds success response without links", () => {
    const resp = buildPersistedResponse("Документ", "ingest-456", {
      personId: null,
      objectId: null,
      materialId: null,
      transitionId: null,
    });
    expect(resp.message).toContain("Сохранено");
    expect(resp.message).not.toContain("Связи");
  });
});

describe("buildFailedResponse", () => {
  it("builds failed response with reason", () => {
    const resp = buildFailedResponse("test.pdf", "не удалось извлечь");
    expect(resp.message).toContain("test.pdf");
    expect(resp.message).toContain("не удалось извлечь");
  });

  it("builds generic failed response", () => {
    const resp = buildFailedResponse("test.pdf");
    expect(resp.message).toContain("test.pdf");
    expect(resp.message).toContain("/new_gnb");
  });
});
