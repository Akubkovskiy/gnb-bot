/**
 * Intake engine — state machine for /new_gnb Draft Intake Mode.
 *
 * States:
 *   idle → awaiting_customer → awaiting_object → awaiting_gnb_number
 *   → awaiting_base_confirmation → collecting_documents → awaiting_review_confirmation
 *
 * If active draft exists on /new_gnb: offer resume/discard.
 * Text/PDF/photo/Excel in collecting state → intake pipeline.
 */

import type { IntakeDraft, IntakeStores, IntakeResponse, ExtractedField } from "./intake-types.js";
import { findBaseTransition, applyBaseTransitionToDraft } from "./inheritance.js";
import { extractFromText } from "./text-extractor.js";
import { extractDocument, mapExtractionToFields, type ClaudeCaller } from "./doc-extractor.js";
import { buildReviewReport, summarizeBase } from "./review-builder.js";
import { buildIntakeResponse, buildReviewText, buildConfirmBlockedText } from "./intake-response.js";
import { finalizeIntake } from "./finalize-intake.js";
import { parseGnbNumber } from "../domain/formatters.js";

// === Session state (in-memory, per chat) ===

export type IntakeState =
  | "idle"
  | "awaiting_customer"
  | "awaiting_object"
  | "awaiting_gnb_number"
  | "awaiting_base_confirmation"
  | "collecting"
  | "awaiting_review_confirmation"
  | "resume_prompt";

interface Session {
  state: IntakeState;
  draftId?: string;
  customer?: string;
  object?: string;
  gnb_number?: string;
  baseTransitionId?: string;
}

const sessions = new Map<number, Session>();

function getSession(chatId: number): Session {
  return sessions.get(chatId) ?? { state: "idle" };
}

function setSession(chatId: number, session: Session): void {
  sessions.set(chatId, session);
}

function clearSession(chatId: number): void {
  sessions.delete(chatId);
}

// === Public API ===

/**
 * Start a new intake flow via /new_gnb.
 */
export function startIntake(chatId: number, stores: IntakeStores): IntakeResponse {
  // Check for existing active intake draft
  const existing = stores.intakeDrafts.getByChatId(chatId);
  if (existing && existing.status !== "finalized") {
    setSession(chatId, { state: "resume_prompt", draftId: existing.id });
    const fieldsCount = existing.fields.filter((f) => !f.conflict_with_existing).length;
    return {
      message:
        `У вас есть незавершённый черновик (${fieldsCount} полей собрано).\n\n` +
        `Продолжить сбор данных? (да / нет / заново)`,
    };
  }

  setSession(chatId, { state: "awaiting_customer" });
  return { message: "Новый ГНБ-переход. Кто заказчик?" };
}

/**
 * Handle text input in an active intake session.
 * Returns null if no active session (fall through to Claude).
 */
export function handleIntakeText(
  chatId: number,
  text: string,
  stores: IntakeStores,
): IntakeResponse | null {
  const session = getSession(chatId);
  if (session.state === "idle") return null;

  const input = text.trim();
  const lower = input.toLowerCase();

  // Cancel
  if (lower === "/cancel" || lower === "отмена") {
    return cancelIntake(chatId, stores);
  }

  // Review command from any collecting state
  if ((lower === "/review_gnb" || lower === "review" || lower === "проверить" || lower === "сводка") && session.state === "collecting") {
    return handleReview(chatId, stores);
  }

  switch (session.state) {
    case "resume_prompt":
      return handleResumePrompt(chatId, input, stores);
    case "awaiting_customer":
      return handleCustomerInput(chatId, input, stores);
    case "awaiting_object":
      return handleObjectInput(chatId, input, stores);
    case "awaiting_gnb_number":
      return handleGnbNumberInput(chatId, input, stores);
    case "awaiting_base_confirmation":
      return handleBaseConfirmation(chatId, input, stores);
    case "collecting":
      return handleCollectingText(chatId, input, stores);
    case "awaiting_review_confirmation":
      return handleReviewConfirmation(chatId, input, stores);
    default:
      return null;
  }
}

/**
 * Handle document (PDF/photo/Excel) in an active intake session.
 * Returns null if no active session.
 */
export async function handleIntakeDocument(
  chatId: number,
  filePath: string,
  fileName: string,
  stores: IntakeStores,
  callClaude: ClaudeCaller,
): Promise<IntakeResponse | null> {
  const session = getSession(chatId);
  if (session.state !== "collecting" || !session.draftId) return null;

  const draft = stores.intakeDrafts.get(session.draftId);
  if (!draft) return null;

  // Extract document
  const result = await extractDocument(filePath, callClaude);

  // Add source
  const sourceId = `doc-${Date.now()}`;
  stores.intakeDrafts.addSource(draft.id, {
    source_id: sourceId,
    source_type: result.source_type,
    original_file_name: fileName,
    doc_class: result.doc_class,
    received_at: new Date().toISOString(),
    parse_status: result.fields.length > 0 ? "parsed" : "failed",
    short_summary: result.summary,
  });

  // Map and apply fields
  const mappedFields = mapExtractionToFields(result, sourceId);
  let updated = 0;
  let conflicts = 0;
  for (const field of mappedFields) {
    const res = stores.intakeDrafts.setField(draft.id, field);
    if (res.updated) updated++;
    if (res.conflict) conflicts++;
  }

  // Build response
  const freshDraft = stores.intakeDrafts.get(draft.id)!;
  const base = freshDraft.base_transition_id
    ? stores.transitions.get(freshDraft.base_transition_id) ?? undefined
    : undefined;
  return {
    message: buildIntakeResponse({
      docClass: result.doc_class,
      fileName,
      summary: result.summary,
      fieldsExtracted: result.fields.length,
      fieldsUpdated: updated,
      conflictsFound: conflicts,
      warnings: result.warnings,
      draft: freshDraft,
      base,
    }),
  };
}

/**
 * Handle /review_gnb command.
 */
export function handleReview(chatId: number, stores: IntakeStores): IntakeResponse {
  const session = getSession(chatId);
  const draftId = session.draftId;
  if (!draftId) {
    return { message: "Нет активного черновика. Начните с /new_gnb." };
  }

  const draft = stores.intakeDrafts.get(draftId);
  if (!draft) {
    clearSession(chatId);
    return { message: "Черновик не найден. Начните с /new_gnb." };
  }

  const base = draft.base_transition_id
    ? stores.transitions.get(draft.base_transition_id) ?? undefined
    : undefined;
  const report = buildReviewReport(draft, base);

  if (report.ready_for_confirmation) {
    setSession(chatId, { ...session, state: "awaiting_review_confirmation" });
  }

  return { message: buildReviewText(report) };
}

/**
 * Cancel active intake.
 */
export function cancelIntake(chatId: number, stores: IntakeStores): IntakeResponse {
  const session = getSession(chatId);
  if (session.draftId) {
    stores.intakeDrafts.delete(session.draftId);
  }
  clearSession(chatId);
  return { message: "Черновик отменён." };
}

/**
 * Check if chat has an active intake session.
 */
export function hasActiveIntake(chatId: number): boolean {
  const session = getSession(chatId);
  return session.state !== "idle";
}

// === Internal handlers ===

function handleResumePrompt(chatId: number, input: string, stores: IntakeStores): IntakeResponse {
  const session = getSession(chatId);
  const lower = input.toLowerCase();

  if (lower === "да" || lower === "продолжить") {
    // Resume collecting
    setSession(chatId, { ...session, state: "collecting" });
    return { message: "Продолжаем. Присылайте данные или /review_gnb для сводки." };
  }

  if (lower === "нет" || lower === "заново") {
    // Discard and start fresh
    if (session.draftId) stores.intakeDrafts.delete(session.draftId);
    setSession(chatId, { state: "awaiting_customer" });
    return { message: "Старый черновик удалён. Новый ГНБ-переход. Кто заказчик?" };
  }

  return { message: "Продолжить текущий черновик? (да / нет / заново)" };
}

function handleCustomerInput(chatId: number, input: string, stores: IntakeStores): IntakeResponse {
  // Search customer in store
  const found = stores.customers.findByNameOrAlias(input);

  if (found) {
    const objects = stores.customers.getObjects(found.slug);
    setSession(chatId, { ...getSession(chatId), state: "awaiting_object", customer: found.name });

    if (objects.length > 0) {
      const list = objects.map((o, i) => `  ${i + 1}. ${o.name}`).join("\n");
      return { message: `${found.name}. Какой объект?\n${list}` };
    }
    return { message: `${found.name}. Какой объект? (введите название)` };
  }

  // Accept as new customer
  setSession(chatId, { ...getSession(chatId), state: "awaiting_object", customer: input });
  return { message: `${input}. Какой объект?` };
}

function handleObjectInput(chatId: number, input: string, stores: IntakeStores): IntakeResponse {
  const session = getSession(chatId);
  const customer = session.customer!;

  // Try to resolve by number — need slug for getObjects
  const found = stores.customers.findByNameOrAlias(customer);
  const objects = found ? stores.customers.getObjects(found.slug) : [];
  const idx = parseInt(input, 10);
  let objectName: string;

  if (!isNaN(idx) && idx >= 1 && idx <= objects.length) {
    objectName = objects[idx - 1].name;
  } else {
    objectName = input;
  }

  setSession(chatId, { ...session, state: "awaiting_gnb_number", object: objectName });

  // Find last transition for hint
  const last = findBaseTransition(customer, objectName, stores.transitions);
  const hint = last ? ` (последний — ${last.gnb_number})` : "";

  return { message: `${objectName}. Какой номер нового перехода?${hint}` };
}

function handleGnbNumberInput(chatId: number, input: string, stores: IntakeStores): IntakeResponse {
  const session = getSession(chatId);
  const { customer, object } = session;

  // Parse GNB number
  const parsed = parseGnbNumber(input);

  // Create intake draft
  const draft = stores.intakeDrafts.create(chatId);
  const draftId = draft.id;

  // Set identity fields
  stores.intakeDrafts.setField(draftId, makeManualField("customer", customer!));
  stores.intakeDrafts.setField(draftId, makeManualField("object", object!));
  stores.intakeDrafts.setField(draftId, makeManualField("gnb_number", parsed.full));
  stores.intakeDrafts.setField(draftId, makeManualField("gnb_number_short", parsed.short));

  // Look for base transition
  const base = findBaseTransition(customer!, object!, stores.transitions);

  if (base) {
    setSession(chatId, {
      ...session,
      state: "awaiting_base_confirmation",
      draftId,
      gnb_number: parsed.full,
      baseTransitionId: base.id,
    });
    const baseSummary = summarizeBase(base);
    const sigList = baseSummary.signatories.map((s) => `  • ${s.role}: ${s.full_name}`).join("\n");
    return {
      message:
        `Найден предыдущий ${base.gnb_number} на ${object}.\n` +
        `Подписанты:\n${sigList}\n` +
        (baseSummary.pipe ? `Труба: ${baseSummary.pipe.mark}\n` : "") +
        `\nИспользовать как основу? (да / нет)`,
    };
  }

  // No base — go straight to collecting
  setSession(chatId, { ...session, state: "collecting", draftId, gnb_number: parsed.full });
  return {
    message:
      `Черновик ${parsed.full} создан.\n` +
      `Предыдущих переходов на ${object} не найдено.\n\n` +
      `Присылайте данные:\n` +
      `  • ИС PDF (исполнительная схема)\n` +
      `  • Паспорта / сертификаты\n` +
      `  • Даты, адрес, подписанты — текстом\n` +
      `  • /review_gnb — сводка\n` +
      `  • /cancel — отменить`,
  };
}

function handleBaseConfirmation(chatId: number, input: string, stores: IntakeStores): IntakeResponse {
  const session = getSession(chatId);
  const lower = input.toLowerCase();

  if (lower === "да" || lower === "использовать") {
    // Apply base
    const base = stores.transitions.get(session.baseTransitionId!);
    if (base) {
      const inherited = applyBaseTransitionToDraft(session.draftId!, base, stores.intakeDrafts);

      setSession(chatId, { ...session, state: "collecting" });
      return {
        message:
          `✅ База из ${base.gnb_number} применена (${inherited.length} полей унаследовано).\n\n` +
          `Присылайте данные по новому ГНБ:\n` +
          `  • ИС PDF (обязательно — геометрия, адрес)\n` +
          `  • Даты работ\n` +
          `  • Подписанты, если изменились\n` +
          `  • Паспорта/сертификаты, если новые\n` +
          `  • /review_gnb — сводка\n` +
          `  • /cancel — отменить`,
      };
    }
  }

  if (lower === "нет" || lower === "с нуля") {
    setSession(chatId, { ...session, state: "collecting" });
    return {
      message:
        `Черновик ${session.gnb_number} без базы.\n\n` +
        `Присылайте все данные:\n` +
        `  • ИС PDF, паспорта, сертификаты\n` +
        `  • Даты, адрес, подписанты — текстом\n` +
        `  • /review_gnb — сводка`,
    };
  }

  return { message: "Использовать предыдущий ГНБ как основу? (да / нет)" };
}

function handleCollectingText(chatId: number, input: string, stores: IntakeStores): IntakeResponse {
  const session = getSession(chatId);
  const draftId = session.draftId;
  if (!draftId) return { message: "Ошибка: черновик не найден." };

  const draft = stores.intakeDrafts.get(draftId);
  if (!draft) {
    clearSession(chatId);
    return { message: "Черновик не найден. Начните с /new_gnb." };
  }

  // Extract fields from text
  const sourceId = `text-${Date.now()}`;
  const extraction = extractFromText(input, sourceId);

  // Add source
  stores.intakeDrafts.addSource(draftId, {
    source_id: sourceId,
    source_type: "manual_text",
    doc_class: "free_text_note",
    received_at: new Date().toISOString(),
    parse_status: extraction.fields.length > 0 ? "parsed" : "failed",
    short_summary: extraction.fields.length > 0
      ? `Текст: ${extraction.fields.length} полей`
      : "Текст без распознанных данных",
  });

  // Apply fields
  let updated = 0;
  let conflicts = 0;
  for (const field of extraction.fields) {
    const res = stores.intakeDrafts.setField(draftId, field);
    if (res.updated) updated++;
    if (res.conflict) conflicts++;
  }

  if (extraction.fields.length === 0) {
    return {
      message:
        `Не распознал структурированных данных в тексте.\n` +
        `Попробуйте формат: "даты 10.12.2025 - 22.12.2025 адрес Огородный д.11"\n` +
        `Или пришлите PDF/фото документа.`,
    };
  }

  const freshDraft = stores.intakeDrafts.get(draftId)!;
  const base = freshDraft.base_transition_id
    ? stores.transitions.get(freshDraft.base_transition_id) ?? undefined
    : undefined;

  return {
    message: buildIntakeResponse({
      docClass: "free_text_note",
      fileName: undefined,
      summary: `Текстовый ввод: ${extraction.fields.length} полей`,
      fieldsExtracted: extraction.fields.length,
      fieldsUpdated: updated,
      conflictsFound: conflicts,
      warnings: [],
      draft: freshDraft,
      base,
    }),
  };
}

function handleReviewConfirmation(chatId: number, input: string, stores: IntakeStores): IntakeResponse {
  const session = getSession(chatId);
  const lower = input.toLowerCase();

  if (lower === "да" || lower === "подтвердить" || lower === "ок") {
    return confirmAndFinalize(chatId, stores);
  }

  if (lower === "нет") {
    setSession(chatId, { ...session, state: "collecting" });
    return { message: "Возвращаемся к сбору данных. Присылайте уточнения или /review_gnb." };
  }

  return { message: "Подтвердить генерацию? (да / нет)" };
}

function confirmAndFinalize(chatId: number, stores: IntakeStores): IntakeResponse {
  const session = getSession(chatId);
  const draftId = session.draftId;
  if (!draftId) return { message: "Ошибка: черновик не найден." };

  const draft = stores.intakeDrafts.get(draftId);
  if (!draft) {
    clearSession(chatId);
    return { message: "Черновик не найден. Начните с /new_gnb." };
  }

  const base = draft.base_transition_id
    ? stores.transitions.get(draft.base_transition_id) ?? undefined
    : undefined;
  const report = buildReviewReport(draft, base);

  if (!report.ready_for_confirmation) {
    return { message: buildConfirmBlockedText(report) };
  }

  // Finalize
  const result = finalizeIntake(draft, stores);
  if (!result.success) {
    return { message: `❌ Ошибка финализации:\n${result.errors.join("\n")}` };
  }

  // Mark draft as finalized
  stores.intakeDrafts.setStatus(draftId, "finalized");
  clearSession(chatId);

  return {
    message:
      `✅ Переход ${result.transition!.gnb_number} сохранён.\nID: ${result.transition!.id}`,
    done: true,
    transition: result.transition!,
  };
}

// === Helpers ===

function makeManualField(name: string, value: unknown): ExtractedField {
  return {
    field_name: name as any,
    value,
    source_id: "manual-identity",
    source_type: "manual_text",
    confidence: "high",
    confirmed_by_owner: true,
    conflict_with_existing: false,
  };
}
