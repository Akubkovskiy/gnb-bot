/**
 * Reasoning-first text handler — replaces regex-only path.
 *
 * Flow:
 * 1. Try regex extraction (fast, free)
 * 2. If regex found < 2 fields → call Claude reasoning with DB context
 * 3. Apply whichever gave better results
 *
 * This is the async bridge between intake-engine and reasoning layer.
 */

import type { IntakeResponse, IntakeStores, ExtractedField, FieldName } from "./intake-types.js";
import { REQUIRED_FIELDS } from "./intake-types.js";
import { extractFromText } from "./text-extractor.js";
import { buildIntakeResponse } from "./intake-response.js";
import { processIntakeText } from "../db/reasoning.js";
import { getDb } from "../db/client.js";
import { getFieldLabel } from "./field-policy.js";
import type { IntakeReasoningOutput } from "../db/reasoning-contracts.js";
import { logger } from "../logger.js";

type ClaudeCaller = (prompt: string, opts?: { systemPrompt?: string }) => Promise<string>;

const REGEX_THRESHOLD = 2; // If regex finds >= this many fields, skip Claude

/**
 * Process text through hybrid pipeline: regex first, Claude reasoning fallback.
 *
 * Returns null if no active draft or error.
 */
export async function processTextWithReasoning(
  chatId: number,
  input: string,
  draftId: string,
  stores: IntakeStores,
  memoryDir: string,
  objectId: string | undefined,
  callClaude: ClaudeCaller,
): Promise<{
  response: IntakeResponse;
  updatedFields: Array<{ name: FieldName; value: unknown }>;
  conflictFields: Array<{ name: FieldName; currentValue: unknown; candidateValue: unknown }>;
  usedReasoning: boolean;
} | null> {
  const draft = stores.intakeDrafts.get(draftId);
  if (!draft) return null;

  const sourceId = `text-${Date.now()}`;

  // Step 1: Try regex
  const regexResult = extractFromText(input, sourceId);

  // Step 2: Decide if we need Claude reasoning
  let fieldsToApply: ExtractedField[] = regexResult.fields;
  let usedReasoning = false;
  let reasoningSummary: string | undefined;

  if (regexResult.fields.length < REGEX_THRESHOLD && objectId) {
    // Regex found too little — try Claude reasoning with DB context
    try {
      const db = getDb(memoryDir);
      const draftSummary: Record<string, unknown> = {};
      for (const f of draft.fields) {
        if (!f.conflict_with_existing) draftSummary[f.field_name] = f.value;
      }
      const missingFields = REQUIRED_FIELDS.filter(
        (r) => !draft.fields.some((f) => f.field_name === r && !f.conflict_with_existing),
      );

      const reasoningOutput = await processIntakeText(
        db, input, objectId, draftSummary, missingFields, callClaude,
      );

      if (reasoningOutput) {
        // Handle non-field intents first
        if (reasoningOutput.intent === "lookup_query" || reasoningOutput.intent === "question") {
          // Lookup/question — return Claude's summary directly, no field updates
          return {
            response: { message: reasoningOutput.summary },
            updatedFields: [],
            conflictFields: [],
            usedReasoning: true,
          };
        }

        if (reasoningOutput.intent === "confirmation") {
          // Confirmation — pass through to normal handler
          return null; // Let sync handler deal with да/нет
        }

        // Convert field updates to ExtractedFields
        fieldsToApply = reasoningOutput.fieldUpdates.map((fu) => ({
          field_name: fu.fieldName as FieldName,
          value: fu.value,
          source_id: sourceId,
          source_type: "manual_text" as const,
          confidence: fu.confidence,
          confirmed_by_owner: false,
          conflict_with_existing: false,
        }));

        // Add signatory updates
        if (reasoningOutput.signatoryUpdates) {
          for (const su of reasoningOutput.signatoryUpdates) {
            if (su.action === "assign") {
              // Look up person from DB to build signatory object
              const { createRepos } = await import("../db/repositories.js");
              const repos = createRepos(db);
              const person = repos.people.getById(su.personId);
              if (person) {
                const org = person.org_id ? repos.orgs.getById(person.org_id) : undefined;
                const docs = repos.personDocs.getCurrentByPersonId(su.personId);
                const fieldName = roleToFieldName(su.role);
                if (fieldName) {
                  fieldsToApply.push({
                    field_name: fieldName,
                    value: {
                      person_id: person.id,
                      role: su.role,
                      org_description: org?.short_name ?? "",
                      position: person.position ?? "",
                      full_name: person.full_name,
                      aosr_full_line: person.aosr_full_line ?? "",
                      ...(person.nrs_id ? { nrs_id: person.nrs_id, nrs_date: person.nrs_date } : {}),
                      ...(docs[0] ? { order_type: docs[0].doc_type, order_number: docs[0].doc_number, order_date: docs[0].doc_date } : {}),
                    },
                    source_id: sourceId,
                    source_type: "manual_text",
                    confidence: "high",
                    confirmed_by_owner: false,
                    conflict_with_existing: false,
                  });
                }
              }
            } else if (su.action === "remove") {
              const fieldName = roleToFieldName(su.role);
              if (fieldName) {
                fieldsToApply.push({
                  field_name: fieldName,
                  value: null,
                  source_id: sourceId,
                  source_type: "manual_text",
                  confidence: "high",
                  confirmed_by_owner: true,
                  conflict_with_existing: false,
                });
              }
            }
          }
        }

        usedReasoning = true;
        reasoningSummary = reasoningOutput.summary;
      }
    } catch (err) {
      logger.warn({ err }, "Reasoning fallback failed, using regex result");
    }
  }

  // Step 3: Add source
  stores.intakeDrafts.addSource(draftId, {
    source_id: sourceId,
    source_type: "manual_text",
    doc_class: "free_text_note",
    received_at: new Date().toISOString(),
    parse_status: fieldsToApply.length > 0 ? "parsed" : "failed",
    short_summary: usedReasoning
      ? `Claude reasoning: ${fieldsToApply.length} полей`
      : `Regex: ${fieldsToApply.length} полей`,
  });

  // Step 4: Apply fields
  let updated = 0;
  let conflicts = 0;
  const updatedFields: Array<{ name: FieldName; value: unknown }> = [];
  const conflictFields: Array<{ name: FieldName; currentValue: unknown; candidateValue: unknown }> = [];

  for (const field of fieldsToApply) {
    const currentDraft = stores.intakeDrafts.get(draftId);
    const existingField = currentDraft?.fields.find((f) => f.field_name === field.field_name && !f.conflict_with_existing);
    const res = stores.intakeDrafts.setField(draftId, field);
    if (res.updated) {
      updated++;
      updatedFields.push({ name: field.field_name, value: field.value });
    }
    if (res.conflict) {
      conflicts++;
      conflictFields.push({ name: field.field_name, currentValue: existingField?.value, candidateValue: field.value });
    }
  }

  if (fieldsToApply.length === 0) {
    return {
      response: {
        message: usedReasoning
          ? (reasoningSummary ?? "Не удалось извлечь данные.")
          : "Не распознал структурированных данных.\nПопробуйте: \"даты 10.12.2025 - 22.12.2025 адрес Огородный д.11\"\nИли пришлите PDF/фото.",
      },
      updatedFields: [],
      conflictFields: [],
      usedReasoning,
    };
  }

  const freshDraft = stores.intakeDrafts.get(draftId)!;
  const base = freshDraft.base_transition_id
    ? stores.transitions.get(freshDraft.base_transition_id) ?? undefined
    : undefined;

  return {
    response: {
      message: buildIntakeResponse({
        docClass: "free_text_note",
        fileName: undefined,
        summary: usedReasoning ? `Claude reasoning: ${fieldsToApply.length} полей` : `Текст: ${fieldsToApply.length} полей`,
        fieldsExtracted: fieldsToApply.length,
        fieldsUpdated: updated,
        conflictsFound: conflicts,
        warnings: [],
        draft: freshDraft,
        base,
        updatedFields,
        conflictFields,
        allExtractedFields: fieldsToApply.map((f) => ({ name: f.field_name, value: f.value })),
      }),
    },
    updatedFields,
    conflictFields,
    usedReasoning,
  };
}

function roleToFieldName(role: string): FieldName | null {
  switch (role) {
    case "sign1": return "signatories.sign1_customer";
    case "sign2": return "signatories.sign2_contractor";
    case "sign3": return "signatories.sign3_optional";
    case "tech": return "signatories.tech_supervisor";
    default: return null;
  }
}
