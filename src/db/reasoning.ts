/**
 * Reasoning orchestrator — bridges retrieval context → Claude skill → draft updates.
 *
 * This is CODE that calls Claude with structured context.
 * The skill (prompt) reasons, code validates and applies the result.
 */

import type { IntakeReasoningInput, IntakeReasoningOutput, IntentType } from "./reasoning-contracts.js";
import type { PersonProfile, ObjectProfile, DraftKnowledgeContext } from "./retrieval.js";
import { findPersonByName, getObjectProfile, getBaseKnowledgeForDraft } from "./retrieval.js";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "./schema.js";
import { logger } from "../logger.js";

type Db = BetterSQLite3Database<typeof schema>;
type ClaudeCaller = (prompt: string, opts?: { systemPrompt?: string }) => Promise<string>;

// === Intake reasoning ===

/**
 * Process free text from owner through Claude reasoning with DB context.
 *
 * 1. Extract mentioned names from text (simple heuristic)
 * 2. Run retrieval for mentioned entities
 * 3. Build structured input for Claude
 * 4. Call Claude with intake-reasoning skill prompt
 * 5. Parse and validate output
 */
export async function processIntakeText(
  db: Db,
  message: string,
  objectId: string,
  draftSummary: Record<string, unknown>,
  missingFields: string[],
  callClaude: ClaudeCaller,
): Promise<IntakeReasoningOutput | null> {
  // Step 1: Extract mentioned names (simple heuristic — look for Cyrillic surnames)
  const mentionedNames = extractMentionedNames(message);

  // Step 2: Retrieval
  const context = getBaseKnowledgeForDraft(db, objectId, mentionedNames);

  // Step 3: Build structured input
  const input: IntakeReasoningInput = {
    message,
    draftSummary,
    retrievalContext: {
      mentionedPeople: context.mentionedPeople.map(personToContext),
      objectProfile: context.object ? {
        shortName: context.object.object.short_name,
        officialName: context.object.object.official_name,
        lastGnb: context.object.lastFinalized?.gnb_number,
        lastSignatories: context.object.lastSignatories,
      } : undefined,
    },
    missingFields,
  };

  // Step 4: Call Claude with skill prompt
  const skillPrompt = buildIntakeReasoningPrompt(input);
  let rawResponse: string;
  try {
    rawResponse = await callClaude(skillPrompt);
  } catch (err) {
    logger.error({ err }, "Claude reasoning call failed");
    return null;
  }

  // Step 5: Parse and validate
  return parseReasoningOutput(rawResponse);
}

// === Prompt builders ===
// NOTE: These inline prompts are the actual runtime prompts.
// .claude/skills/*/SKILL.md files are reference specs for the reasoning contracts.
// They define the expected behavior but are NOT read at runtime by the bot.
// When updating behavior, update BOTH the inline prompt AND the SKILL.md.

function buildIntakeReasoningPrompt(input: IntakeReasoningInput): string {
  return `Ты — GNB intake reasoning engine. Анализируешь сообщение owner'а и возвращаешь structured JSON.

СООБЩЕНИЕ OWNER:
"${input.message}"

ТЕКУЩИЙ DRAFT:
${JSON.stringify(input.draftSummary, null, 2)}

КОНТЕКСТ ИЗ БАЗЫ:
${JSON.stringify(input.retrievalContext, null, 2)}

НЕ ХВАТАЕТ ПОЛЕЙ:
${input.missingFields.join(", ") || "все обязательные заполнены"}

ПРАВИЛА:
- Определи intent: field_update, signatory_assignment, lookup_query, reuse_request, manual_override, absence_declaration, confirmation, question, unknown
- Извлеки field updates с confidence
- Если упомянут человек из базы — используй его данные (personId, role)
- Если человек НЕ в базе — пометь source: "owner_text", confidence: "medium"
- НЕ выдумывай данные
- "Стройтреста нет" = absence_declaration, sign3 = null
- "технадзор Гайдуков" = signatory_assignment, role: "tech", personId из базы

ФОРМАТ ОТВЕТА (только JSON, без markdown):
{
  "intent": "...",
  "fieldUpdates": [{ "fieldName": "...", "value": ..., "confidence": "high", "source": "..." }],
  "signatoryUpdates": [{ "role": "...", "personId": "...", "action": "assign" }],
  "questionsForOwner": [],
  "summary": "..."
}`;
}

// === Output parsing ===

function parseReasoningOutput(raw: string): IntakeReasoningOutput | null {
  // Extract JSON from response (may be wrapped in markdown)
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    logger.warn({ raw: raw.slice(0, 200) }, "Could not find JSON in reasoning output");
    return null;
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);

    // Validate required fields
    if (!parsed.intent || !parsed.summary) {
      logger.warn({ parsed }, "Reasoning output missing required fields");
      return null;
    }

    // Normalize
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
    "field_update", "signatory_assignment", "lookup_query", "reuse_request",
    "manual_override", "absence_declaration", "confirmation", "question", "unknown",
  ];
  return valid.includes(intent as IntentType) ? (intent as IntentType) : "unknown";
}

// === Helpers ===

/**
 * Simple heuristic to extract potential surnames from Russian text.
 * Looks for capitalized Cyrillic words that could be surnames.
 */
function extractMentionedNames(text: string): string[] {
  const names: string[] = [];
  // Match capitalized Cyrillic words (potential surnames)
  const matches = text.match(/[А-ЯЁ][а-яё]{2,}/g);
  if (!matches) return names;

  // Filter out common non-name words
  const stopWords = new Set([
    "Мастер", "Технадзор", "Подрядчик", "Субподрядчик", "Заказчик",
    "Начальник", "Главный", "Специалист", "Стройтрест", "Стройтреста",
    "Москва", "Москвы", "Адрес", "Объект", "Проект", "Труба",
    "Паспорт", "Сертификат", "Приказ", "Распоряжение", "Участка",
    "Строительство", "Выполнение", "Прокладке", "Резервирование",
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
    position: p.person.position,
    org: p.org?.short_name,
    currentDocs: p.currentDocs.map((d) => ({
      docType: d.doc_type,
      docNumber: d.doc_number,
      docDate: d.doc_date,
    })),
  };
}

export { extractMentionedNames };
