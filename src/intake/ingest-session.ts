/**
 * Ingest session — state machine for standalone knowledge ingestion.
 *
 * Separate from draft intake sessions. Manages the flow:
 *   idle → extracting → awaiting_link → persisted
 *
 * When a document is uploaded outside /new_gnb and the bot identifies it as
 * useful knowledge, or the owner says "сохрани" / "save data", the ingest
 * session guides linking the document to the right entity in SQLite.
 */

import type { KnowledgeIngestOutput } from "../db/reasoning-contracts.js";
import type { InlineButton } from "./intake-types.js";

// === Session state ===

export type IngestState =
  | "idle"
  | "awaiting_link"       // Claude returned questions — waiting for owner answer
  | "awaiting_link_choice" // owner needs to pick from multiple options
  | "done";

export interface IngestSession {
  state: IngestState;
  /** Pending ingest result (has missing links / questions). */
  pendingResult?: KnowledgeIngestOutput;
  /** Which missing link we're currently asking about. */
  currentQuestion?: string;
  /** File path on disk (for persist after linking). */
  filePath?: string;
  /** Original file name. */
  fileName?: string;
  /** Timestamp when session started. */
  startedAt: number;
}

// === In-memory session store ===

const sessions = new Map<number, IngestSession>();

export function getIngestSession(chatId: number): IngestSession | null {
  return sessions.get(chatId) ?? null;
}

export function setIngestSession(chatId: number, session: IngestSession): void {
  sessions.set(chatId, session);
}

export function clearIngestSession(chatId: number): void {
  sessions.delete(chatId);
}

export function hasActiveIngestSession(chatId: number): boolean {
  const s = sessions.get(chatId);
  return s != null && s.state !== "idle" && s.state !== "done";
}

/** Reset all sessions (for testing). */
export function _resetAllIngestSessions(): void {
  sessions.clear();
}

// === Trigger detection ===

const SAVE_TRIGGERS = [
  "сохрани",
  "сохрани данные",
  "save data",
  "save",
  "сохранить",
  "запомни",
  "запомни данные",
  "в базу",
];

/**
 * Check if text is a standalone save/ingest trigger.
 * Returns true if the owner wants to save data to the knowledge base.
 */
export function isSaveTrigger(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return SAVE_TRIGGERS.some((t) => lower === t || lower.startsWith(t + " "));
}

// === Response builders ===

export interface IngestResponse {
  message: string;
  buttons?: InlineButton[][];
}

/**
 * Build response when ingest has questions for the owner.
 */
export function buildQuestionsResponse(result: KnowledgeIngestOutput): IngestResponse {
  const lines: string[] = [`📎 ${result.summary}`];

  if (result.questionsForOwner.length > 0) {
    lines.push("");
    for (const q of result.questionsForOwner) {
      lines.push(`❓ ${q}`);
    }
  }

  if (result.missingLinks.length > 0) {
    lines.push("");
    lines.push("Не удалось определить:");
    for (const link of result.missingLinks) {
      lines.push(`  • ${link}`);
    }
  }

  return {
    message: lines.join("\n"),
    buttons: [
      [
        { text: "Пропустить связи", callback_data: "ingest:skip_links" },
        { text: "Отмена", callback_data: "ingest:cancel" },
      ],
    ],
  };
}

/**
 * Build response for successful persistence.
 */
export function buildPersistedResponse(
  summary: string,
  documentId: string,
  links: KnowledgeIngestOutput["suggestedLinks"],
): IngestResponse {
  const parts: string[] = [`✅ Сохранено: ${summary}`, `ID: ${documentId}`];

  const linkDescriptions: string[] = [];
  if (links.personId) linkDescriptions.push(`человек: ${links.personId}`);
  if (links.objectId) linkDescriptions.push(`объект: ${links.objectId}`);
  if (links.materialId) linkDescriptions.push(`материал: ${links.materialId}`);
  if (links.transitionId) linkDescriptions.push(`переход: ${links.transitionId}`);

  if (linkDescriptions.length > 0) {
    parts.push(`Связи: ${linkDescriptions.join(", ")}`);
  }

  return { message: parts.join("\n") };
}

/**
 * Build response when ingest failed.
 */
export function buildFailedResponse(fileName: string, reason?: string): IngestResponse {
  return {
    message: reason
      ? `❌ Не удалось обработать ${fileName}: ${reason}`
      : `❌ Не удалось обработать ${fileName}. Попробуйте начать /new_gnb для работы с документом.`,
  };
}

/**
 * Handle text answer from owner during ingest session.
 * Updates the pending result with the provided link info.
 */
export function handleIngestTextAnswer(
  chatId: number,
  text: string,
): { updated: boolean; result?: KnowledgeIngestOutput } {
  const session = getIngestSession(chatId);
  if (!session || session.state !== "awaiting_link" || !session.pendingResult) {
    return { updated: false };
  }

  const lower = text.toLowerCase().trim();

  // "cancel" / "отмена" → abort ingest
  if (lower === "отмена" || lower === "cancel" || lower === "/cancel") {
    clearIngestSession(chatId);
    return { updated: false };
  }

  // "skip" / "пропустить" → persist without missing links
  if (lower === "пропустить" || lower === "skip") {
    const result = session.pendingResult;
    result.missingLinks = [];
    result.questionsForOwner = [];
    return { updated: true, result };
  }

  // Otherwise, treat text as an answer to the first missing link question.
  // The answer could be an object name, person name, etc.
  // Store it in extractedData for the caller to resolve.
  const result = { ...session.pendingResult };
  result.extractedData = {
    ...result.extractedData,
    ownerAnswer: text.trim(),
  };
  // Clear questions — the owner answered
  result.questionsForOwner = [];
  result.missingLinks = [];

  return { updated: true, result };
}
