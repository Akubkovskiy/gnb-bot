/**
 * Reasoning orchestrator - bridges retrieval context -> Claude -> draft updates.
 *
 * This is CODE that assembles structured context for Claude.
 * Claude returns JSON, then code validates and applies it.
 */

import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "./schema.js";
import type { IntakeReasoningInput, IntakeReasoningOutput, IntentType } from "./reasoning-contracts.js";
import type { PersonProfile } from "./retrieval.js";
import { getBaseKnowledgeForDraft } from "./retrieval.js";
import { logger } from "../logger.js";

type Db = BetterSQLite3Database<typeof schema>;
type ClaudeCaller = (prompt: string, opts?: { systemPrompt?: string; model?: string }) => Promise<string>;

/**
 * Process free text from owner through Claude reasoning with DB context.
 *
 * 1. Extract mentioned names from text with a cheap heuristic
 * 2. Build retrieval context from DB
 * 3. Call Claude with a structured prompt
 * 4. Parse and validate JSON response
 */
export async function processIntakeText(
  db: Db,
  message: string,
  objectId: string,
  draftSummary: Record<string, unknown>,
  missingFields: string[],
  callClaude: ClaudeCaller,
): Promise<IntakeReasoningOutput | null> {
  const mentionedNames = extractMentionedNames(message);
  const context = getBaseKnowledgeForDraft(db, objectId, mentionedNames);

  const input: IntakeReasoningInput = {
    message,
    draftSummary,
    retrievalContext: {
      mentionedPeople: context.mentionedPeople.map(personToContext),
      objectProfile: context.object
        ? {
            shortName: context.object.object.short_name,
            officialName: context.object.object.official_name,
            lastGnb: context.object.lastFinalized?.gnb_number,
            lastSignatories: context.object.lastSignatories,
          }
        : undefined,
    },
    missingFields,
  };

  const prompt = buildIntakeReasoningPrompt(input);

  let rawResponse: string;
  try {
    const { config } = await import("../config.js");
    rawResponse = await callClaude(prompt, { model: config.claudeReasoningModel });
  } catch (err) {
    logger.error({ err }, "Claude reasoning call failed");
    return null;
  }

  return parseReasoningOutput(rawResponse);
}

function buildIntakeReasoningPrompt(input: IntakeReasoningInput): string {
  return `You are the GNB intake reasoning engine.
Analyze the owner's message and return valid JSON only.

OWNER MESSAGE:
"${input.message}"

CURRENT DRAFT:
${JSON.stringify(input.draftSummary, null, 2)}

RETRIEVAL CONTEXT FROM DB:
${JSON.stringify(input.retrievalContext, null, 2)}

MISSING REQUIRED FIELDS:
${input.missingFields.join(", ") || "all required fields are already filled"}

RULES:
- Determine one intent: field_update, signatory_assignment, lookup_query, reuse_request, manual_override, absence_declaration, confirmation, question, unknown.
- Extract field updates with confidence.
- If a mentioned person is found in DB and isActive=true, you may use that personId.
- If a mentioned person is found in DB but isActive=false, do not silently assign them; ask the owner whether that inactive person should still be used.
- If multiple people match the same surname, prefer the active person with current docs or active roles. If still ambiguous, ask the owner.
- If a person is not found in DB, use action "needs_manual" and include newPersonData when possible.
- Never invent data not supported by the message or DB context.
- "Стройтреста нет" usually means absence_declaration and removal of optional subcontractor/sign3 context if relevant.
- "технадзор Гайдуков" usually means signatory_assignment for role "tech".

RETURN ONLY VALID JSON, NO MARKDOWN:
{
  "intent": "...",
  "fieldUpdates": [{ "fieldName": "...", "value": "...", "confidence": "high", "source": "owner_text" }],
  "signatoryUpdates": [{ "role": "...", "personId": "...", "action": "assign" }],
  "questionsForOwner": [],
  "summary": "..."
}`;
}

function parseReasoningOutput(raw: string): IntakeReasoningOutput | null {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    logger.warn({ raw: raw.slice(0, 200) }, "Could not find JSON in reasoning output");
    return null;
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);

    if (!parsed.intent || !parsed.summary) {
      logger.warn({ parsed }, "Reasoning output missing required fields");
      return null;
    }

    return {
      intent: validateIntent(parsed.intent),
      fieldUpdates: Array.isArray(parsed.fieldUpdates) ? parsed.fieldUpdates : [],
      signatoryUpdates: Array.isArray(parsed.signatoryUpdates) ? parsed.signatoryUpdates : undefined,
      questionsForOwner: Array.isArray(parsed.questionsForOwner) ? parsed.questionsForOwner : undefined,
      summary: String(parsed.summary),
    };
  } catch (err) {
    logger.warn({ err, raw: raw.slice(0, 200) }, "Failed to parse reasoning JSON");
    return null;
  }
}

function validateIntent(intent: string): IntentType {
  const valid: IntentType[] = [
    "field_update",
    "signatory_assignment",
    "lookup_query",
    "reuse_request",
    "manual_override",
    "absence_declaration",
    "confirmation",
    "question",
    "unknown",
  ];

  return valid.includes(intent as IntentType) ? (intent as IntentType) : "unknown";
}

/**
 * Cheap heuristic to extract likely surnames from Russian text.
 * Surname matching is only the search entry point; actual decisions must use DB status.
 */
function extractMentionedNames(text: string): string[] {
  const names: string[] = [];
  const matches = text.match(/[А-ЯЁ][а-яё]{2,}/g);
  if (!matches) return names;

  const stopWords = new Set([
    "Мастер",
    "Технадзор",
    "Подрядчик",
    "Субподрядчик",
    "Заказчик",
    "Начальник",
    "Главный",
    "Специалист",
    "Стройтрест",
    "Стройтреста",
    "Москва",
    "Москвы",
    "Адрес",
    "Объект",
    "Проект",
    "Труба",
    "Паспорт",
    "Сертификат",
    "Приказ",
    "Распоряжение",
    "Участка",
    "Строительство",
    "Выполнение",
    "Прокладке",
    "Резервирование",
  ]);

  for (const word of matches) {
    if (!stopWords.has(word) && word.length >= 3) {
      names.push(word);
    }
  }

  return [...new Set(names)];
}

function personToContext(p: PersonProfile) {
  return {
    personId: p.person.id,
    fullName: p.person.full_name,
    isActive: p.isActive,
    position: p.person.position,
    org: p.org?.short_name,
    activeRoles: p.activeRoles,
    currentDocs: p.currentDocs.map((d) => ({
      docType: d.doc_type,
      docNumber: d.doc_number,
      docDate: d.doc_date,
    })),
  };
}

export { extractMentionedNames };
