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

import type { IntakeDraft, IntakeStores, IntakeResponse, ExtractedField, InlineButton } from "./intake-types.js";
import { REQUIRED_FIELDS } from "./intake-types.js";
import { findBaseTransition, applyBaseTransitionToDraft } from "./inheritance.js";
import { extractFromText } from "./text-extractor.js";
import { extractDocument, mapExtractionToFields, type ClaudeCaller } from "./doc-extractor.js";
import { buildReviewReport, summarizeBase } from "./review-builder.js";
import { buildIntakeResponse, buildReviewText, buildConfirmBlockedText, buildMissingFieldsText } from "./intake-response.js";
import { isSchemeAuthoritative } from "./field-policy.js";
import { findCustomer as dbFindCustomer, findObject as dbFindObject } from "../db/retrieval.js";
import { getDb } from "../db/client.js";
import { getMemoryDir } from "../utils/paths.js";
import { finalizeIntake } from "./finalize-intake.js";
import { parseGnbNumber } from "../domain/formatters.js";
import { buildDocumentReview, formatDocumentReview } from "./document-review.js";
import { getReusableBaseDocuments, buildDocumentRegistry, deriveRegistryDocument } from "./document-registry.js";
import { buildNameProposal, applyApprovedName, validateNameProposal } from "./naming.js";
import { evaluateDocumentCoverage, allRequiredPresent, getMissingRequired } from "./document-requirements.js";
import { buildDebugSnapshot, formatDebugReview } from "./debug-view.js";
import * as dbSchema from "../db/schema.js";
import { createRepos } from "../db/repositories.js";

// === Session state (in-memory, per chat) ===

export type IntakeState =
  | "idle"
  | "awaiting_customer"
  | "awaiting_object"
  | "awaiting_gnb_number"
  | "awaiting_base_confirmation"
  | "collecting"
  | "awaiting_review_confirmation"
  | "awaiting_name_confirmation"
  | "awaiting_name_edit"
  | "resume_prompt";

interface Session {
  state: IntakeState;
  draftId?: string;
  customer?: string;
  object?: string;
  gnb_number?: string;
  baseTransitionId?: string;
  /** Doc ID currently being named (for naming approval flow). */
  pendingNamingDocId?: string;
  /** Last service message ID (for edit-in-place). */
  lastServiceMessageId?: number;
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

/** Reset all sessions (for testing). */
export function _resetAllSessions(): void {
  sessions.clear();
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
      message: `У вас есть незавершённый черновик (${fieldsCount} полей собрано).`,
      buttons: [
        [
          { text: "Продолжить", callback_data: "intake:resume" },
          { text: "Заново", callback_data: "intake:discard" },
          { text: "Отменить", callback_data: "intake:cancel" },
        ],
      ],
    };
  }

  setSession(chatId, { state: "awaiting_customer" });

  // Build customer list from JSON store + SQLite
  const customerNames: string[] = [];
  try {
    const jsonCustomers = stores.customers.list();
    for (const c of jsonCustomers) customerNames.push(c.name);
  } catch { /* no JSON store */ }
  try {
    const db = getDb(getMemoryDir());
    const s = dbSchema;
    const rows = db.select({ name: s.customers.name }).from(s.customers).all();
    for (const c of rows) {
      if (c.name && !customerNames.some((n) => n.toLowerCase() === c.name.toLowerCase())) {
        customerNames.push(c.name);
      }
    }
  } catch (err) {
    // silently ignore — DB not available
  }

  if (customerNames.length > 0) {
    const list = customerNames.map((n, i) => `  ${i + 1}. ${n}`).join("\n");
    return { message: `Новый ГНБ-переход. Кто заказчик?\n${list}` };
  }
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
    case "awaiting_name_confirmation": {
      // Short answers (да/нет/пропустить/исправить) → naming handler
      // Longer text → auto-skip naming, process as collecting data
      const isNamingAnswer = ["да", "нет", "подтвердить", "ок", "пропустить", "исправить", "изменить"].includes(lower);
      if (isNamingAnswer) {
        return handleNameTextResponse(chatId, input, stores);
      }
      // Auto-skip naming, return to collecting
      setSession(chatId, { ...session, state: "collecting", pendingNamingDocId: undefined });
      return handleCollectingText(chatId, input, stores);
    }
    case "awaiting_name_edit":
      return handleNameEditInput(chatId, input, stores);
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
  // Accept documents in collecting or naming states (auto-skip naming)
  const acceptStates: IntakeState[] = ["collecting", "awaiting_name_confirmation", "awaiting_name_edit"];
  if (!acceptStates.includes(session.state) || !session.draftId) return null;

  // Auto-reset naming state
  if (session.state !== "collecting") {
    setSession(chatId, { ...session, state: "collecting", pendingNamingDocId: undefined });
  }

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
  const updatedDocFields: Array<{ name: any; value: unknown }> = [];
  const conflictDocFields: Array<{ name: any; currentValue: unknown; candidateValue: unknown }> = [];
  const isScheme = result.doc_class === "executive_scheme";
  for (const field of mappedFields) {
    // Get current value before setField to show in conflict
    const currentDraft = stores.intakeDrafts.get(draft.id);
    const existingField = currentDraft?.fields.find((f) => f.field_name === field.field_name && !f.conflict_with_existing);
    // Scheme-authoritative fields auto-apply from ИС without conflict
    const schemeAuth = isScheme && isSchemeAuthoritative(field.field_name);
    const res = stores.intakeDrafts.setField(draft.id, field, { schemeAuthoritative: schemeAuth });
    if (res.updated) {
      updated++;
      updatedDocFields.push({ name: field.field_name, value: field.value });
    }
    if (res.conflict) {
      conflicts++;
      conflictDocFields.push({
        name: field.field_name,
        currentValue: existingField?.value,
        candidateValue: field.value,
      });
    }
  }

  // Build response
  const freshDraft = stores.intakeDrafts.get(draft.id)!;
  const base = freshDraft.base_transition_id
    ? stores.transitions.get(freshDraft.base_transition_id) ?? undefined
    : undefined;

  // Deduplicate updatedFields by field name — for merge fields (pipe),
  // use the final merged value from the draft instead of raw _merge fragments
  const deduped = new Map<string, { name: any; value: unknown }>();
  for (const f of updatedDocFields) {
    if (deduped.has(f.name)) {
      // For pipe: use the merged value from the draft
      const draftField = freshDraft.fields.find((df) => df.field_name === f.name && !df.conflict_with_existing);
      deduped.set(f.name, { name: f.name, value: draftField?.value ?? f.value });
    } else {
      // First occurrence: also prefer draft value for _merge fields
      const val = f.value && typeof f.value === "object" && "_merge" in (f.value as Record<string, unknown>)
        ? freshDraft.fields.find((df) => df.field_name === f.name && !df.conflict_with_existing)?.value ?? f.value
        : f.value;
      deduped.set(f.name, { name: f.name, value: val });
    }
  }
  const dedupedFields = [...deduped.values()];

  const responseMsg = buildIntakeResponse({
    docClass: result.doc_class,
    fileName,
    summary: result.summary,
    fieldsExtracted: result.fields.length,
    fieldsUpdated: updated,
    conflictsFound: conflicts,
    warnings: result.warnings,
    draft: freshDraft,
    base,
    updatedFields: dedupedFields,
    conflictFields: conflictDocFields,
    allExtractedFields: mappedFields.map((f) => ({ name: f.field_name, value: f.value })),
  });

  // Offer naming proposal for non-trivial documents
  const nameable = result.doc_class !== "free_text_note" && result.doc_class !== "unknown";
  if (nameable) {
    const source = freshDraft.sources.find((s) => s.source_id === sourceId);
    if (source) {
      const regDoc = deriveRegistryDocument(source, freshDraft);
      const proposal = buildNameProposal(regDoc);

      let namingLine: string;
      if (proposal.complete) {
        namingLine = `\n📎 Имя: ${proposal.suggested_name}`;
      } else {
        namingLine = `\n📎 Имя (неполное): ${proposal.suggested_name}\n  ⚠ Не хватает: ${proposal.missing_parts.join(", ")}`;
      }

      setSession(chatId, { ...session, state: "awaiting_name_confirmation", pendingNamingDocId: sourceId });
      return {
        message: responseMsg + namingLine,
        buttons: [
          [
            { text: "Подтвердить имя", callback_data: "intake:name_approve" },
            { text: "Исправить", callback_data: "intake:name_edit" },
            { text: "Пропустить", callback_data: "intake:name_skip" },
          ],
        ],
      };
    }
  }

  return {
    message: responseMsg,
    buttons: buildIntakeButtons(freshDraft),
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
  const docReview = buildDocumentReview(draft, base);

  // Build combined review text
  let reviewText = buildReviewText(report);
  reviewText += "\n\n" + formatDocumentReview(docReview);

  if (report.ready_for_confirmation) {
    setSession(chatId, { ...session, state: "awaiting_review_confirmation" });
    return {
      message: reviewText,
      buttons: [
        [
          { text: "Подтвердить", callback_data: "intake:confirm" },
          { text: "Вернуться к сбору", callback_data: "intake:back_collecting" },
        ],
      ],
    };
  }

  return {
    message: reviewText,
    buttons: [
      [{ text: "Вернуться к сбору", callback_data: "intake:back_collecting" }],
    ],
  };
}

/**
 * Handle /review_gnb_debug command.
 * Returns debug field mapping view + saves debug JSON snapshot.
 */
export function handleDebugReview(chatId: number, stores: IntakeStores): { message: string; snapshot: ReturnType<typeof buildDebugSnapshot> } | { message: string; snapshot: null } {
  const session = getSession(chatId);
  const draftId = session.draftId;
  if (!draftId) {
    return { message: "Нет активного черновика. Начните с /new_gnb.", snapshot: null };
  }

  const draft = stores.intakeDrafts.get(draftId);
  if (!draft) {
    return { message: "Черновик не найден.", snapshot: null };
  }

  const snapshot = buildDebugSnapshot(draft);
  const text = formatDebugReview(snapshot);
  return { message: text, snapshot };
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

/** Get current session info for external async handlers. */
export function getSessionInfo(chatId: number): { state: IntakeState; draftId?: string; objectId?: string; object?: string } {
  const s = getSession(chatId);
  const objectId = s.customer && s.object ? `${slugify(s.customer)}-${slugify(s.object)}` : undefined;
  return { state: s.state, draftId: s.draftId, objectId, object: s.object };
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[«»"']/g, "").replace(/[^a-zа-яё0-9]+/gi, "-").replace(/^-|-$/g, "") || "unknown";
}

/**
 * Handle inline button callback.
 */
export function handleCallback(chatId: number, data: string, stores: IntakeStores): IntakeResponse | null {
  const session = getSession(chatId);

  switch (data) {
    case "intake:resume":
      return handleResumePrompt(chatId, "да", stores);
    case "intake:discard":
      return handleResumePrompt(chatId, "заново", stores);
    case "intake:cancel":
      return cancelIntake(chatId, stores);
    case "intake:base_yes":
      return handleBaseConfirmation(chatId, "да", stores);
    case "intake:base_no":
      return handleBaseConfirmation(chatId, "нет", stores);
    case "intake:confirm":
      return handleReviewConfirmation(chatId, "да", stores);
    case "intake:back_collecting":
      setSession(chatId, { ...session, state: "collecting" });
      return { message: "Присылайте данные или /review_gnb." };
    case "intake:review":
      return handleReview(chatId, stores);
    case "intake:show_base":
      return handleShowBase(chatId, stores);
    case "intake:missing":
      return handleMissing(chatId, stores);
    case "intake:name_approve":
      return handleNameApprove(chatId, stores);
    case "intake:name_edit":
      setSession(chatId, { ...session, state: "awaiting_name_edit" });
      return { message: "Введите правильное имя файла:" };
    case "intake:name_skip":
      return handleNameSkip(chatId, stores);
    default:
      return null;
  }
}

/**
 * Show what's available in the base transition ("что есть в базе").
 */
export function handleShowBase(chatId: number, stores: IntakeStores): IntakeResponse {
  const session = getSession(chatId);
  const draftId = session.draftId;
  if (!draftId) return { message: "Нет активного черновика." };

  const draft = stores.intakeDrafts.get(draftId);
  if (!draft?.base_transition_id) {
    return { message: "У текущего черновика нет базового ГНБ." };
  }

  const base = stores.transitions.get(draft.base_transition_id);
  if (!base) return { message: "Базовый переход не найден." };

  const reusable = getReusableBaseDocuments(base);
  if (reusable.length === 0) {
    return { message: "В базовом ГНБ нет документов для повторного использования." };
  }

  const lines: string[] = [`📦 Из ${base.gnb_number}:`];
  for (const doc of reusable) {
    lines.push(`  • ${doc.label}${doc.details ? ` (${doc.details})` : ""}`);
  }
  lines.push("\nЭти данные уже унаследованы в текущий черновик.");

  return { message: lines.join("\n") };
}

/**
 * Get intake menu buttons for collecting state.
 */
export function getCollectingMenu(): InlineButton[][] {
  return [
    [
      { text: "Проверить ГНБ", callback_data: "intake:review" },
      { text: "Что в базе", callback_data: "intake:show_base" },
    ],
    [
      { text: "Отменить", callback_data: "intake:cancel" },
    ],
  ];
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
  // Handle numeric selection from customer list
  const idx = parseInt(input, 10);
  if (!isNaN(idx) && idx >= 1) {
    const customerNames: string[] = [];
    try {
      for (const c of stores.customers.list()) customerNames.push(c.name);
    } catch { /* */ }
    try {
      const db = getDb(getMemoryDir());
      const s = dbSchema;
      const rows = db.select({ name: s.customers.name }).from(s.customers).all();
      for (const c of rows) {
        if (c.name && !customerNames.some((n) => n.toLowerCase() === c.name.toLowerCase())) {
          customerNames.push(c.name);
        }
      }
    } catch { /* */ }
    if (idx <= customerNames.length) {
      input = customerNames[idx - 1];
    }
  }

  // Search customer in JSON store first (backward compat)
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

  // Try SQLite alias-aware lookup as fallback
  try {
    const db = getDb(getMemoryDir());
    const dbCustomer = dbFindCustomer(db, input);
    if (dbCustomer) {
      const repos = createRepos(db);
      const dbObjects = repos.objects.getByCustomerId(dbCustomer.id);
      setSession(chatId, { ...getSession(chatId), state: "awaiting_object", customer: dbCustomer.name });

      if (dbObjects.length > 0) {
        const list = dbObjects.map((o: any, i: number) => `  ${i + 1}. ${o.short_name}`).join("\n");
        return { message: `${dbCustomer.name}. Какой объект?\n${list}` };
      }
      return { message: `${dbCustomer.name}. Какой объект? (введите название)` };
    }
  } catch { /* DB not initialized — fallthrough */ }

  // Accept as new customer
  setSession(chatId, { ...getSession(chatId), state: "awaiting_object", customer: input });
  return { message: `${input}. Какой объект?` };
}

function handleObjectInput(chatId: number, input: string, stores: IntakeStores): IntakeResponse {
  const session = getSession(chatId);
  const customer = session.customer!;

  // Collect objects from JSON store + SQLite
  const found = stores.customers.findByNameOrAlias(customer);
  const jsonObjects = found ? stores.customers.getObjects(found.slug) : [];
  const objectNames: string[] = jsonObjects.map((o) => o.name);

  // Also check SQLite for objects
  try {
    const db = getDb(getMemoryDir());
    const dbCustomer = dbFindCustomer(db, customer);
    if (dbCustomer) {
      const repos = createRepos(db);
      const dbObjects = repos.objects.getByCustomerId(dbCustomer.id);
      for (const o of dbObjects) {
        const name = (o as any).short_name || (o as any).official_name || "";
        if (name && !objectNames.some((n) => n.toLowerCase() === name.toLowerCase())) {
          objectNames.push(name);
        }
      }
    }
  } catch { /* DB not available */ }

  const idx = parseInt(input, 10);
  let objectName: string;

  if (!isNaN(idx) && idx >= 1 && idx <= objectNames.length) {
    objectName = objectNames[idx - 1];
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
  let { customer, object } = session;

  // Normalize customer name via DB if raw input was stored (JSON store miss on VPS)
  if (customer) {
    const jsonFound = stores.customers.findByNameOrAlias(customer);
    if (jsonFound) {
      customer = jsonFound.name;
    } else {
      try {
        const db = getDb(getMemoryDir());
        const dbCustomer = dbFindCustomer(db, customer);
        if (dbCustomer) customer = dbCustomer.name;
      } catch { /* DB not available */ }
    }
  }

  // Normalize object name via JSON store or DB
  if (object && customer) {
    const jsonCust = stores.customers.findByNameOrAlias(customer);
    if (jsonCust) {
      const objects = stores.customers.getObjects(jsonCust.slug);
      const match = objects.find((o) => o.name.toLowerCase() === object!.toLowerCase());
      if (match) object = match.name;
    }
    if (object === session.object) {
      // JSON didn't normalize — try SQLite
      try {
        const db = getDb(getMemoryDir());
        const dbCustomer = dbFindCustomer(db, customer);
        if (dbCustomer) {
          const dbObj = dbFindObject(db, dbCustomer.id, object);
          if (dbObj) object = dbObj.short_name;
        }
      } catch { /* DB not available */ }
    }
  }

  // Parse GNB number
  const parsed = parseGnbNumber(input);

  // Create intake draft
  const draft = stores.intakeDrafts.create(chatId);
  const draftId = draft.id;

  // Set identity fields
  // Routing context — not confirmed, can be updated by scheme/extraction
  stores.intakeDrafts.setField(draftId, makeRoutingField("customer", customer!));
  stores.intakeDrafts.setField(draftId, makeRoutingField("object", object!));
  // GNB number — confirmed by owner
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
        (baseSummary.pipe ? `Труба: ${baseSummary.pipe.mark}` : ""),
      buttons: [
        [
          { text: "Использовать как основу", callback_data: "intake:base_yes" },
          { text: "С нуля", callback_data: "intake:base_no" },
        ],
      ],
    };
  }

  // No base — go straight to collecting
  setSession(chatId, { ...session, state: "collecting", draftId, gnb_number: parsed.full });
  return {
    message:
      `Черновик ${parsed.full} создан (без базы).\n` +
      `Присылайте: ИС PDF, паспорта, даты, подписанты.`,
    buttons: [
      [
        { text: "Проверить ГНБ", callback_data: "intake:review" },
        { text: "Отменить", callback_data: "intake:cancel" },
      ],
    ],
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
      // Build highlights from base
      const highlights: string[] = [];
      const s = base.signatories;
      if (s?.sign1_customer) highlights.push(`  • Мастер: ${s.sign1_customer.full_name}`);
      if (s?.sign2_contractor) highlights.push(`  • Подрядчик: ${s.sign2_contractor.full_name}`);
      if (s?.tech_supervisor) highlights.push(`  • Технадзор: ${s.tech_supervisor.full_name}`);
      if (base.pipe?.mark) highlights.push(`  • Труба: ${base.pipe.mark}`);

      const highlightBlock = highlights.length > 0
        ? `\n${highlights.join("\n")}\n`
        : "\n";

      return {
        message:
          `✅ База из ${base.gnb_number} применена.\n` +
          `Унаследовано ${inherited.length} полей, ключевые:` +
          highlightBlock +
          `Полная сводка: /review_gnb\n` +
          `Присылайте: ИС PDF, даты, подписанты, паспорта.`,
        buttons: getCollectingMenu(),
      };
    }
  }

  if (lower === "нет" || lower === "с нуля") {
    setSession(chatId, { ...session, state: "collecting" });
    return {
      message: `Черновик ${session.gnb_number} без базы.\nПрисылайте: ИС PDF, паспорта, даты, подписанты.`,
      buttons: getCollectingMenu(),
    };
  }

  return {
    message: "Использовать предыдущий ГНБ как основу?",
    buttons: [
      [
        { text: "Да", callback_data: "intake:base_yes" },
        { text: "Нет", callback_data: "intake:base_no" },
      ],
    ],
  };
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

  // Apply fields and track what was updated
  let updated = 0;
  let conflicts = 0;
  const updatedFields: Array<{ name: any; value: unknown }> = [];
  const conflictFields: Array<{ name: any; currentValue: unknown; candidateValue: unknown }> = [];
  for (const field of extraction.fields) {
    const currentDraft = stores.intakeDrafts.get(draftId);
    const existingField = currentDraft?.fields.find((f) => f.field_name === field.field_name && !f.conflict_with_existing);
    const res = stores.intakeDrafts.setField(draftId, field);
    if (res.updated) {
      updated++;
      updatedFields.push({ name: field.field_name, value: field.value });
    }
    if (res.conflict) {
      conflicts++;
      conflictFields.push({
        name: field.field_name,
        currentValue: existingField?.value,
        candidateValue: field.value,
      });
    }
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
      updatedFields,
      conflictFields,
      allExtractedFields: extraction.fields.map((f) => ({ name: f.field_name, value: f.value })),
    }),
    buttons: buildIntakeButtons(freshDraft),
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

// === Intake response buttons ===

function buildIntakeButtons(draft: IntakeDraft): InlineButton[][] {
  const missingRequired = REQUIRED_FIELDS.filter(
    (r: any) => !draft.fields.some((f) => f.field_name === r && !f.conflict_with_existing),
  );

  const buttons: InlineButton[][] = [];
  if (missingRequired.length === 0) {
    // All required fields present — offer review + confirm
    buttons.push([
      { text: "Проверить ГНБ", callback_data: "intake:review" },
      { text: "Подтвердить", callback_data: "intake:confirm" },
    ]);
  } else {
    buttons.push([
      { text: `Не хватает (${missingRequired.length})`, callback_data: "intake:missing" },
      { text: "Сводка", callback_data: "intake:review" },
    ]);
  }

  return buttons;
}

// === Missing fields handler ===

function handleMissing(chatId: number, stores: IntakeStores): IntakeResponse {
  const session = getSession(chatId);
  const draftId = session.draftId;
  if (!draftId) return { message: "Нет активного черновика." };

  const draft = stores.intakeDrafts.get(draftId);
  if (!draft) return { message: "Черновик не найден." };

  return {
    message: buildMissingFieldsText(draft),
    buttons: [[{ text: "Назад", callback_data: "intake:back_collecting" }]],
  };
}

// === Naming approval handlers ===

function handleNameApprove(chatId: number, stores: IntakeStores): IntakeResponse {
  const session = getSession(chatId);
  const docId = session.pendingNamingDocId;
  if (!docId || !session.draftId) {
    setSession(chatId, { ...session, state: "collecting", pendingNamingDocId: undefined });
    return { message: "Нет документа для подтверждения. Продолжаем сбор." };
  }

  const draft = stores.intakeDrafts.get(session.draftId);
  if (!draft) {
    clearSession(chatId);
    return { message: "Черновик не найден." };
  }

  // Find the registry doc in sources and build proposal
  const source = draft.sources.find((s) => s.source_id === docId);
  if (!source) {
    setSession(chatId, { ...session, state: "collecting", pendingNamingDocId: undefined });
    return { message: "Документ не найден. Продолжаем сбор." };
  }

  const regDoc = deriveRegistryDocument(source, draft);
  const proposal = buildNameProposal(regDoc);

  // Store approved name in source metadata
  source.approved_name = proposal.suggested_name;
  stores.intakeDrafts.updateSource(session.draftId, source);

  setSession(chatId, { ...session, state: "collecting", pendingNamingDocId: undefined });
  return {
    message: `✅ Имя подтверждено: ${proposal.suggested_name}`,
    buttons: getCollectingMenu(),
  };
}

function handleNameSkip(chatId: number, stores: IntakeStores): IntakeResponse {
  const session = getSession(chatId);
  setSession(chatId, { ...session, state: "collecting", pendingNamingDocId: undefined });
  return {
    message: "Пропущено. Имя можно подтвердить позже через /review_gnb.",
    buttons: getCollectingMenu(),
  };
}

function handleNameTextResponse(chatId: number, input: string, stores: IntakeStores): IntakeResponse {
  const lower = input.toLowerCase();
  if (lower === "да" || lower === "подтвердить" || lower === "ок") {
    return handleNameApprove(chatId, stores);
  }
  if (lower === "нет" || lower === "пропустить") {
    return handleNameSkip(chatId, stores);
  }
  if (lower === "исправить" || lower === "изменить") {
    const session = getSession(chatId);
    setSession(chatId, { ...session, state: "awaiting_name_edit" });
    return { message: "Введите правильное имя файла:" };
  }
  return {
    message: "Подтвердить имя? (да / исправить / пропустить)",
    buttons: [
      [
        { text: "Подтвердить", callback_data: "intake:name_approve" },
        { text: "Исправить", callback_data: "intake:name_edit" },
        { text: "Пропустить", callback_data: "intake:name_skip" },
      ],
    ],
  };
}

function handleNameEditInput(chatId: number, input: string, stores: IntakeStores): IntakeResponse {
  const session = getSession(chatId);
  const docId = session.pendingNamingDocId;
  if (!docId || !session.draftId) {
    setSession(chatId, { ...session, state: "collecting", pendingNamingDocId: undefined });
    return { message: "Нет документа для переименования. Продолжаем сбор." };
  }

  const validation = validateNameProposal(input);
  if (!validation.valid) {
    return { message: `❌ ${validation.reason}. Попробуйте ещё раз:` };
  }

  const draft = stores.intakeDrafts.get(session.draftId);
  if (!draft) {
    clearSession(chatId);
    return { message: "Черновик не найден." };
  }

  const source = draft.sources.find((s) => s.source_id === docId);
  if (source) {
    source.approved_name = input.trim();
    stores.intakeDrafts.updateSource(session.draftId, source);
  }

  setSession(chatId, { ...session, state: "collecting", pendingNamingDocId: undefined });
  return {
    message: `✅ Имя установлено: ${input.trim()}`,
    buttons: getCollectingMenu(),
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

/** Routing field — navigation context, not confirmed, can be overridden by scheme. */
function makeRoutingField(name: string, value: unknown): ExtractedField {
  return {
    field_name: name as any,
    value,
    source_id: "manual-identity",
    source_type: "manual_text",
    confidence: "high",
    confirmed_by_owner: false,
    conflict_with_existing: false,
  };
}
