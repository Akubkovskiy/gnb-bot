/**
 * Reasoning-first text handler.
 *
 * Flow:
 * 1. Try regex extraction (fast and cheap)
 * 2. If regex finds too little, call Claude reasoning with DB context
 * 3. Apply extracted fields and signatory updates
 * 4. If the result is a pure lookup or clarification, return the summary directly
 */

import type { IntakeResponse, IntakeStores, ExtractedField, FieldName } from "./intake-types.js";
import { REQUIRED_FIELDS } from "./intake-types.js";
import { extractFromText } from "./text-extractor.js";
import { buildIntakeResponse } from "./intake-response.js";
import { processIntakeText } from "../db/reasoning.js";
import { getDb } from "../db/client.js";
import { logger } from "../logger.js";

type ClaudeCaller = (prompt: string, opts?: { systemPrompt?: string; model?: string }) => Promise<string>;

const REGEX_THRESHOLD = 2;

// === Gating: decide whether Claude reasoning is needed ===

const CONFIRM_WORDS = new Set(["да", "нет", "ок", "подтвердить", "отмена", "cancel", "review", "проверить", "сводка", "пропустить"]);

/**
 * Determine whether this text needs Claude reasoning or can be handled cheaply.
 * Returns true = call Claude, false = regex-only is sufficient.
 */
export function shouldUseReasoning(input: string, regexFieldCount: number): boolean {
  const trimmed = input.trim();
  const lower = trimmed.toLowerCase();

  // 1. Short confirmations — never Claude
  if (CONFIRM_WORDS.has(lower)) return false;

  // 2. Very short text (1-2 words, no semantic content) — skip
  if (trimmed.split(/\s+/).length <= 2 && regexFieldCount === 0) {
    if (/^[А-ЯЁ][а-яё]+$/.test(trimmed)) return true; // single surname → might be signatory
    if (lower.includes("нет")) return true; // "Стройтреста нет" → absence declaration
    if (/(?:мастер|технадзор|подрядчик|субподрядчик)/i.test(lower)) return true; // role mention
    return false;
  }

  // 3. Regex found enough fields — no need for Claude (unless text is very long / complex)
  if (regexFieldCount >= REGEX_THRESHOLD && trimmed.length < 80) return false;

  // 4. Looks like a lookup/question — needs Claude
  if (lower.includes("что у нас") || lower.includes("какие") || lower.includes("покажи") || lower.includes("есть ли")) return true;

  // 5. Looks like a reuse request — needs Claude
  if (lower.includes("возьми") || lower.includes("используй") || lower.includes("как в прошл") || lower.includes("reuse")) return true;

  // 6. Looks like absence/role change — needs Claude
  if (lower.includes("нет") && lower.length > 5) return true; // "Стройтреста нет"
  if (/(?:мастер|технадзор|подрядчик|субподрядчик|sign)/i.test(lower)) return true;

  // 7. Contains signatory document markers — always Claude
  if (/(?:НРС|идентификационный\s*номер|приказ\s*№|распоряжение\s*№|[A-ZА-Я]-\d{2}-\d{6})/i.test(lower)) return true;

  // 8. Has cyrillic names that might be signatories — needs Claude
  const potentialNames = trimmed.match(/[А-ЯЁ][а-яё]{2,}/g);
  if (potentialNames && potentialNames.length > 0 && regexFieldCount < REGEX_THRESHOLD) return true;

  // 9. Medium-length text with low regex yield — try Claude
  if (trimmed.length > 20 && regexFieldCount < REGEX_THRESHOLD) return true;

  return false;
}

export async function processTextWithReasoning(
  _chatId: number,
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

  const regexResult = extractFromText(input, sourceId);
  let fieldsToApply: ExtractedField[] = regexResult.fields;
  let usedReasoning = false;
  let reasoningSummary: string | undefined;

  // DB-enrich signatory fields from regex: if just a surname, look up full profile
  try {
    const db = getDb(memoryDir);
    const { createRepos: cr } = await import("../db/repositories.js");
    const repos = cr(db);
    for (let i = 0; i < fieldsToApply.length; i++) {
      const f = fieldsToApply[i];
      if (!f.field_name.startsWith("signatories.")) continue;
      const val = f.value as Record<string, unknown> | null;
      if (!val?.full_name) continue;
      const name = String(val.full_name);
      // Only enrich if it looks like a bare surname (no initials)
      if (name.includes(".") || name.split(/\s+/).length > 1) continue;
      const candidates = repos.people.findBySurname(name);
      if (candidates.length > 0) {
        const person = candidates[0];
        const org = person.org_id ? repos.orgs.getById(person.org_id) : undefined;
        const docs = repos.personDocs.getCurrentByPersonId(person.id);
        fieldsToApply[i] = {
          ...f,
          value: {
            person_id: person.id,
            role: (val.role as string) || "",
            org_description: org?.short_name ?? "",
            position: person.position ?? "",
            full_name: person.full_name,
            aosr_full_line: person.aosr_full_line ?? "",
            ...(person.nrs_id ? { nrs_id: person.nrs_id, nrs_date: person.nrs_date } : {}),
            ...(docs[0] ? { order_type: docs[0].doc_type, order_number: docs[0].doc_number, order_date: docs[0].doc_date } : {}),
          },
          confidence: "high",
        };

        // Auto-fill organization from person's org
        if (org) {
          const orgFieldName = roleToOrgFieldName(
            f.field_name === "signatories.sign1_customer" ? "sign1_customer"
              : f.field_name === "signatories.sign2_contractor" ? "sign2_contractor"
              : f.field_name === "signatories.sign3_optional" ? "sign3_optional"
              : f.field_name === "signatories.tech_supervisor" ? "tech_supervisor"
              : "",
          );
          if (orgFieldName) {
            fieldsToApply.push({
              field_name: orgFieldName,
              value: {
                id: org.id,
                name: org.name,
                short_name: org.short_name,
                ogrn: org.ogrn ?? "",
                inn: org.inn ?? "",
                legal_address: org.legal_address ?? "",
                phone: org.phone ?? "",
                sro_name: org.sro_name ?? "",
              },
              source_id: f.source_id,
              source_type: "manual_text",
              confidence: "high",
              confirmed_by_owner: false,
              conflict_with_existing: false,
            });
          }
        }
      }
    }
  } catch { /* DB not available */ }

  if (shouldUseReasoning(input, regexResult.fields.length) && objectId) {
    try {
      const db = getDb(memoryDir);
      const draftSummary: Record<string, unknown> = {};
      for (const f of draft.fields) {
        if (!f.conflict_with_existing) {
          draftSummary[f.field_name] = f.value;
        }
      }

      const missingFields = REQUIRED_FIELDS.filter(
        (requiredField) => !draft.fields.some(
          (f) => f.field_name === requiredField && !f.conflict_with_existing,
        ),
      );

      const reasoningOutput = await processIntakeText(
        db,
        input,
        objectId,
        draftSummary,
        missingFields,
        callClaude,
      );

      logger.info({ intent: reasoningOutput?.intent, fieldUpdates: reasoningOutput?.fieldUpdates?.length, signatoryUpdates: reasoningOutput?.signatoryUpdates?.length, summary: reasoningOutput?.summary?.slice(0, 100) }, "Reasoning output");

      if (reasoningOutput) {
        if (reasoningOutput.intent === "lookup_query" || reasoningOutput.intent === "question") {
          return {
            response: { message: reasoningOutput.summary },
            updatedFields: [],
            conflictFields: [],
            usedReasoning: true,
          };
        }

        if (reasoningOutput.intent === "confirmation") {
          // If there are signatory updates, don't skip — apply them
          if (!reasoningOutput.signatoryUpdates?.length && !reasoningOutput.fieldUpdates?.length) {
            // Return the summary as acknowledgment instead of null (which causes "Не распознал")
            return {
              response: { message: reasoningOutput.summary || "Принято." },
              updatedFields: [],
              conflictFields: [],
              usedReasoning: true,
            };
          }
          // Otherwise fall through to process field/signatory updates
        }

        fieldsToApply = reasoningOutput.fieldUpdates
          .filter((fieldUpdate) => {
            // Reject sub-field names like "signatories.sign1_customer.position"
            // Valid FieldName has at most 2 segments (e.g., "signatories.sign1_customer")
            const segments = fieldUpdate.fieldName.split(".");
            if (segments.length > 2) {
              logger.warn({ fieldName: fieldUpdate.fieldName }, "Rejected invalid sub-field name from reasoning");
              return false;
            }
            return true;
          })
          .map((fieldUpdate) => ({
            field_name: fieldUpdate.fieldName as FieldName,
            value: fieldUpdate.value,
            source_id: sourceId,
            source_type: "manual_text" as const,
            confidence: fieldUpdate.confidence,
            confirmed_by_owner: false,
            conflict_with_existing: false,
          }));

        if (reasoningOutput.signatoryUpdates?.length) {
          const { createRepos } = await import("../db/repositories.js");
          const repos = createRepos(db);

          // Track person_ids already assigned in this draft to prevent duplicates
          const assignedPersonIds = new Set<string>();
          for (const f of draft.fields) {
            if (f.field_name.startsWith("signatories.") && !f.conflict_with_existing) {
              const val = f.value as Record<string, unknown> | null;
              if (val?.person_id && typeof val.person_id === "string" && val.person_id !== "") {
                assignedPersonIds.add(val.person_id);
              }
            }
          }
          // Also track person_ids being assigned in this batch
          const batchPersonIds = new Set<string>();

          for (const signatoryUpdate of reasoningOutput.signatoryUpdates) {
            if (signatoryUpdate.action === "assign") {
              // Try exact ID first, then fuzzy name search
              let person = repos.people.getById(signatoryUpdate.personId);
              if (!person) {
                // Claude may return surname or full name instead of DB id
                const candidates = repos.people.findBySurname(signatoryUpdate.personId)
                  || repos.people.findByName(signatoryUpdate.personId);
                if (candidates.length > 0) person = candidates[0];
              }
              if (!person) {
                logger.warn({ personId: signatoryUpdate.personId, role: signatoryUpdate.role }, "Person not found in DB for signatory assignment");
                // Fall back to regex-extracted signatory data from the original text
                const fieldName = roleToFieldName(signatoryUpdate.role);
                if (fieldName) {
                  const regexSig = regexResult.fields.find((f) => f.field_name === fieldName);
                  if (regexSig) {
                    // Use the regex-extracted signatory with manual_text priority
                    fieldsToApply.push({ ...regexSig, source_id: sourceId, source_type: "manual_text" });
                  } else if (signatoryUpdate.newPersonData) {
                    // Use Claude's newPersonData as a best-effort entry
                    const npd = signatoryUpdate.newPersonData as Record<string, string>;
                    fieldsToApply.push({
                      field_name: fieldName,
                      value: {
                        person_id: "",
                        role: signatoryUpdate.role,
                        org_description: npd.org ?? "",
                        position: npd.position ?? "—",
                        full_name: npd.fullName ?? signatoryUpdate.personId,
                        aosr_full_line: "",
                      },
                      source_id: sourceId,
                      source_type: "manual_text",
                      confidence: "medium",
                      confirmed_by_owner: false,
                      conflict_with_existing: false,
                    });
                  }
                }
                continue;
              }

              // Check for duplicate: if this person is already assigned to another role, skip
              const targetFieldName = roleToFieldName(signatoryUpdate.role);
              if (!targetFieldName) continue;

              if (assignedPersonIds.has(person.id) || batchPersonIds.has(person.id)) {
                // Person already assigned to another role — check if it's a different role
                const existingRole = draft.fields.find(
                  (f) => f.field_name.startsWith("signatories.") && !f.conflict_with_existing
                    && f.field_name !== targetFieldName
                    && (f.value as Record<string, unknown>)?.person_id === person.id,
                );
                if (existingRole) {
                  logger.warn({ personId: person.id, role: signatoryUpdate.role, existingRole: existingRole.field_name }, "Person already assigned to another signatory role, falling back to regex");
                  // Fall back to regex-extracted signatory for this role
                  const regexSig = regexResult.fields.find((f) => f.field_name === targetFieldName);
                  if (regexSig) {
                    fieldsToApply.push({ ...regexSig, source_id: sourceId, source_type: "manual_text" });
                  }
                  continue;
                }
              }

              const org = person.org_id ? repos.orgs.getById(person.org_id) : undefined;
              const docs = repos.personDocs.getCurrentByPersonId(signatoryUpdate.personId);
              const fieldName = targetFieldName;

              batchPersonIds.add(person.id);

              fieldsToApply.push({
                field_name: fieldName,
                value: {
                  person_id: person.id,
                  role: signatoryUpdate.role,
                  org_description: org?.short_name ?? "",
                  position: person.position ?? "",
                  full_name: person.full_name,
                  aosr_full_line: person.aosr_full_line ?? "",
                  ...(person.nrs_id ? { nrs_id: person.nrs_id, nrs_date: person.nrs_date } : {}),
                  ...(docs[0]
                    ? {
                        order_type: docs[0].doc_type,
                        order_number: docs[0].doc_number,
                        order_date: docs[0].doc_date,
                      }
                    : {}),
                },
                source_id: sourceId,
                source_type: "manual_text",
                confidence: "high",
                confirmed_by_owner: false,
                conflict_with_existing: false,
              });

              // Auto-fill organization from person's org — but only if draft doesn't already have richer data
              if (org) {
                const orgFieldName = roleToOrgFieldName(signatoryUpdate.role);
                if (orgFieldName) {
                  const existingOrg = draft.fields.find(
                    (f) => f.field_name === orgFieldName && !f.conflict_with_existing,
                  );
                  const existingOrgVal = existingOrg?.value as Record<string, unknown> | undefined;
                  // Only auto-fill if:
                  // - no existing org data, OR
                  // - existing org is less detailed (shorter string representation)
                  const existingLen = existingOrgVal ? JSON.stringify(existingOrgVal).length : 0;
                  const newOrgValue = {
                    id: org.id,
                    name: org.name,
                    short_name: org.short_name,
                    ogrn: org.ogrn ?? "",
                    inn: org.inn ?? "",
                    legal_address: org.legal_address ?? "",
                    phone: org.phone ?? "",
                    sro_name: org.sro_name ?? "",
                  };
                  const newLen = JSON.stringify(newOrgValue).length;

                  if (!existingOrg || newLen >= existingLen) {
                    fieldsToApply.push({
                      field_name: orgFieldName,
                      value: newOrgValue,
                      source_id: sourceId,
                      source_type: "manual_text",
                      confidence: "high",
                      confirmed_by_owner: false,
                      conflict_with_existing: false,
                    });
                  }
                }
              }
            } else if (signatoryUpdate.action === "remove") {
              const fieldName = roleToFieldName(signatoryUpdate.role);
              if (!fieldName) continue;

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

        usedReasoning = true;
        reasoningSummary = [
          reasoningOutput.summary,
          ...(reasoningOutput.questionsForOwner ?? []),
        ].filter(Boolean).join("\n");
      }
    } catch (err) {
      logger.warn({ err }, "Reasoning fallback failed, using regex result");
    }
  }

  stores.intakeDrafts.addSource(draftId, {
    source_id: sourceId,
    source_type: "manual_text",
    doc_class: "free_text_note",
    received_at: new Date().toISOString(),
    parse_status: fieldsToApply.length > 0 ? "parsed" : "failed",
    short_summary: usedReasoning
      ? `Claude reasoning: ${fieldsToApply.length} fields`
      : `Regex: ${fieldsToApply.length} fields`,
  });

  let updated = 0;
  let conflicts = 0;
  const updatedFields: Array<{ name: FieldName; value: unknown }> = [];
  const conflictFields: Array<{ name: FieldName; currentValue: unknown; candidateValue: unknown }> = [];

  for (const field of fieldsToApply) {
    const currentDraft = stores.intakeDrafts.get(draftId);
    const existingField = currentDraft?.fields.find(
      (f) => f.field_name === field.field_name && !f.conflict_with_existing,
    );
    const result = stores.intakeDrafts.setField(draftId, field);
    if (result.updated) {
      updated += 1;
      updatedFields.push({ name: field.field_name, value: field.value });
    }
    if (result.conflict) {
      conflicts += 1;
      conflictFields.push({
        name: field.field_name,
        currentValue: existingField?.value,
        candidateValue: field.value,
      });
    }
  }

  if (fieldsToApply.length === 0) {
    return {
      response: {
        message: usedReasoning
          ? (reasoningSummary ?? "Не удалось извлечь данные.")
          : "Не распознал структурированных данных.\nПопробуйте: \"даты 10.12.2025 - 22.12.2025 адрес Огородный д.11\"\nИли пришлите PDF/фото документа.",
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

  // Check if all required fields are now present
  const missingRequired = REQUIRED_FIELDS.filter(
    (r) => !freshDraft.fields.some((f) => f.field_name === r && !f.conflict_with_existing),
  );
  const allReady = missingRequired.length === 0;

  // Build buttons: if all required present → offer review/confirm
  const buttons: Array<Array<{ text: string; callback_data: string }>> = [];
  if (allReady) {
    buttons.push([
      { text: "Проверить ГНБ", callback_data: "intake:review" },
      { text: "Подтвердить", callback_data: "intake:confirm" },
    ]);
    buttons.push([{ text: "Отменить", callback_data: "intake:cancel" }]);
  } else {
    buttons.push([
      { text: `Не хватает (${missingRequired.length})`, callback_data: "intake:missing" },
      { text: "Сводка", callback_data: "intake:review" },
    ]);
    buttons.push([{ text: "Отменить", callback_data: "intake:cancel" }]);
  }

  return {
    response: {
      message: buildIntakeResponse({
        docClass: "free_text_note",
        fileName: undefined,
        summary: usedReasoning ? `Claude reasoning: ${fieldsToApply.length} fields` : `Text: ${fieldsToApply.length} fields`,
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
      buttons,
    },
    updatedFields,
    conflictFields,
    usedReasoning,
  };
}

function roleToFieldName(role: string): FieldName | null {
  const r = role.toLowerCase().trim();
  switch (r) {
    case "sign1":
    case "sign1_customer":
    case "мастер":
    case "мастер рэс":
      return "signatories.sign1_customer";
    case "sign2":
    case "sign2_contractor":
    case "подрядчик":
      return "signatories.sign2_contractor";
    case "sign3":
    case "sign3_optional":
    case "sign3_subcontractor":
    case "субподрядчик":
      return "signatories.sign3_optional";
    case "tech":
    case "tech_supervisor":
    case "технадзор":
    case "тн":
      return "signatories.tech_supervisor";
    default:
      return null;
  }
}

/** Map signatory role to the corresponding organization field. */
function roleToOrgFieldName(role: string): FieldName | null {
  const r = role.toLowerCase().trim();
  if (["sign1", "sign1_customer", "мастер", "мастер рэс", "tech", "tech_supervisor", "технадзор"].includes(r)) {
    return "organizations.customer";
  }
  if (["sign2", "sign2_contractor", "подрядчик"].includes(r)) {
    return "organizations.contractor";
  }
  // sign3/subcontractor → designer or subcontractor org, context-dependent
  if (["sign3", "sign3_optional", "sign3_subcontractor", "субподрядчик"].includes(r)) {
    return "organizations.designer"; // OEK model: designer = СПЕЦИНЖСТРОЙ = subcontractor
  }
  return null;
}
