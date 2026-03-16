/**
 * /new_gnb flow engine — 9-step conversation state machine.
 *
 * Pure functions: take (chatId, text, stores) → FlowResponse.
 * No Grammy dependency. No file generation (Phase 4 scope).
 * Draft persistence via DraftStore (survives bot restarts).
 *
 * Step 0 = resume_prompt (awaiting resume/discard answer).
 * Steps 1-9 = normal flow steps.
 */

import type { Draft, Transition, DateComponents } from "../domain/types.js";
import { parseDate, parseGnbNumber, formatDateInternal } from "../domain/formatters.js";
import { generateTransitionId, slugify } from "../domain/ids.js";
import { validateTransition, getBlockers, getWarnings, getConfirms } from "../domain/validators.js";
import type { FlowResponse, FlowStores, FinalizeResult, FlowStep } from "./flow-types.js";
import { FLOW_STEPS, stepFromIndex } from "./flow-types.js";

/** Step 0 = resume prompt state. Real steps are 1-9. */
const RESUME_PROMPT_STEP = 0;

// ─── Public API ──────────────────────────────────────────────

/**
 * Start /new_gnb flow for a chat.
 * If an active draft exists → set step=0 (resume_prompt), ask resume/discard.
 * Otherwise → step 1 (customer).
 */
export function startFlow(chatId: number, stores: FlowStores): FlowResponse {
  const existing = stores.drafts.getByChatId(chatId);
  if (existing) {
    // Save the real step, then set step=0 to mark resume_prompt state
    const realStep = existing.step;
    const stepName = stepFromIndex(realStep);
    const summary = draftSummaryLine(existing);

    // Store real step in draft data so we can restore it later
    stores.drafts.update(existing.id, RESUME_PROMPT_STEP, { _realStep: realStep } as any);

    return {
      message:
        `У вас есть незавершённый черновик: ${summary}\n` +
        `Остановились на шаге ${realStep}/9 (${stepLabel(stepName)}).\n\n` +
        `Продолжить? (да / нет — начать заново)`,
    };
  }

  // No draft — start fresh, ask customer
  const draftId = `draft-${chatId}-${Date.now()}`;
  stores.drafts.create(draftId, chatId, 1, {});
  return { message: promptForStep("customer", stores, chatId) };
}

/**
 * Handle user input in an active /new_gnb flow.
 * Returns null if no active draft (caller should fall through to normal chat).
 */
export function handleInput(chatId: number, text: string, stores: FlowStores): FlowResponse | null {
  const draft = stores.drafts.getByChatId(chatId);
  if (!draft) return null;

  const trimmed = text.trim();

  // Cancel at any point
  if (trimmed.toLowerCase() === "/cancel" || trimmed.toLowerCase() === "отмена") {
    stores.drafts.delete(draft.id);
    return { message: "Черновик отменён.", done: true };
  }

  // Resume prompt handling (step=0)
  if (draft.step === RESUME_PROMPT_STEP) {
    const realStep = (draft.data as any)._realStep || 1;
    // Clean up the temp field
    const cleanData = { ...draft.data };
    delete (cleanData as any)._realStep;

    if (isYes(trimmed)) {
      // Resume: restore real step and re-prompt
      stores.drafts.update(draft.id, realStep, cleanData);
      const freshDraft = stores.drafts.get(draft.id);
      const stepName = stepFromIndex(realStep);
      return { message: promptForStep(stepName, stores, chatId, freshDraft ?? undefined) };
    } else {
      // Discard old draft and start fresh
      stores.drafts.delete(draft.id);
      const newId = `draft-${chatId}-${Date.now()}`;
      stores.drafts.create(newId, chatId, 1, {});
      return { message: "Старый черновик удалён.\n\n" + promptForStep("customer", stores, chatId) };
    }
  }

  // Normal step processing
  const stepName = stepFromIndex(draft.step);
  return processStep(stepName, trimmed, draft, stores);
}

/**
 * Get active draft for a chat (or null).
 */
export function getActiveDraft(chatId: number, stores: FlowStores): Draft | null {
  return stores.drafts.getByChatId(chatId);
}

/**
 * Build review summary text from draft data.
 */
export function buildReviewSummary(draft: Draft): string {
  const d = draft.data;
  const lines: string[] = [];

  lines.push(`Итого ${d.gnb_number || ""}:`);
  lines.push(`  Заказчик: ${d.customer || "—"}`);
  lines.push(`  Объект: ${d.object || "—"}`);
  lines.push(`  Адрес: ${d.address || "—"}`);

  if (d.start_date && d.end_date) {
    lines.push(`  Даты: ${formatDateInternal(d.start_date)} – ${formatDateInternal(d.end_date)}`);
  }

  if (d.signatories) {
    lines.push("  Подписанты:");
    const s = d.signatories;
    if (s.sign1_customer) lines.push(`    1. ${s.sign1_customer.org_description} — ${s.sign1_customer.full_name}, ${s.sign1_customer.position}`);
    if (s.sign2_contractor) lines.push(`    2. ${s.sign2_contractor.org_description} — ${s.sign2_contractor.full_name}, ${s.sign2_contractor.position}`);
    if (s.sign3_optional) lines.push(`    3. ${s.sign3_optional.org_description} — ${s.sign3_optional.full_name}, ${s.sign3_optional.position}`);
    if (s.tech_supervisor) lines.push(`    4. Технадзор — ${s.tech_supervisor.full_name}, ${s.tech_supervisor.position}`);
  }

  if (d.pipe) {
    lines.push(`  Труба: ${d.pipe.mark}`);
  }

  if (d.gnb_params) {
    const gp = d.gnb_params;
    const parts: string[] = [];
    if (gp.plan_length != null) parts.push(`L план: ${gp.plan_length} м`);
    if (gp.profile_length != null) parts.push(`L проф: ${gp.profile_length} м`);
    if (gp.pipe_count != null) parts.push(`труб: ${gp.pipe_count}`);
    if (parts.length) lines.push(`  ${parts.join(", ")}`);
  }

  return lines.join("\n");
}

/**
 * Finalize draft → normalized Transition, save to TransitionStore, delete draft.
 * Returns null if validation has blockers.
 */
export function finalizeDraft(draft: Draft, stores: FlowStores): FinalizeResult | null {
  const d = draft.data as Partial<Transition>;
  const report = validateTransition(d);

  if (!report.valid) {
    return null; // caller should show blockers
  }

  const transition: Transition = {
    id: d.id || generateTransitionId(d.customer || "", d.object || "", d.gnb_number_short || ""),
    status: "finalized",
    created_at: new Date().toISOString(),
    customer: d.customer || "",
    object: d.object || "",
    gnb_number: d.gnb_number || "",
    gnb_number_short: d.gnb_number_short || "",
    title_line: d.title_line || "Строительство КЛ методом ГНБ",
    object_name: d.object_name || d.object || "",
    address: d.address || "",
    project_number: d.project_number || "",
    executor: d.executor || "",
    start_date: d.start_date!,
    end_date: d.end_date!,
    act_date: d.act_date,
    refs: d.refs || { person_ids: [], org_ids: [] },
    organizations: d.organizations!,
    signatories: d.signatories!,
    pipe: d.pipe!,
    materials: d.materials,
    gnb_params: d.gnb_params!,
    source_docs: [],
    generated_files: [],
    validation_report: report,
    revisions: [],
  };

  stores.transitions.create(transition);
  stores.drafts.delete(draft.id);

  // Update customer store
  if (d.customer && d.object) {
    const customerSlug = slugify(d.customer);
    const objectSlug = slugify(d.object);
    try {
      stores.customers.updateLastGnb(customerSlug, objectSlug, transition.gnb_number);
    } catch {
      // Customer/object may not exist in store — OK for MVP
    }
  }

  const warnings = getWarnings(report).map((w) => w.message);
  return { transition, warnings };
}

// ─── Step processors ─────────────────────────────────────────

function processStep(step: FlowStep, input: string, draft: Draft, stores: FlowStores): FlowResponse {
  switch (step) {
    case "customer": return processCustomer(input, draft, stores);
    case "object": return processObject(input, draft, stores);
    case "gnb_number": return processGnbNumber(input, draft, stores);
    case "based_on_previous": return processBasedOn(input, draft, stores);
    case "dates": return processDates(input, draft, stores);
    case "organizations": return processOrganizations(input, draft, stores);
    case "signatories": return processSignatories(input, draft, stores);
    case "pipe_and_gnb_params": return processPipeAndParams(input, draft, stores);
    case "review_confirm": return processReviewConfirm(input, draft, stores);
    default: return { message: "Неизвестный шаг. Используйте /cancel для отмены." };
  }
}

// Step 1: Customer
function processCustomer(input: string, draft: Draft, stores: FlowStores): FlowResponse {
  const found = stores.customers.findByNameOrAlias(input);
  if (found) {
    stores.drafts.update(draft.id, 2, { customer: found.name });
    const objects = stores.customers.getObjects(found.slug);
    if (objects.length > 0) {
      const list = objects.map((o, i) => `  ${i + 1}. ${o.name}`).join("\n");
      return { message: `${found.name}. Какой объект?\n${list}` };
    }
    return { message: `${found.name}. Какой объект? (введите название)` };
  }

  // New customer — accept as-is
  stores.drafts.update(draft.id, 2, { customer: input });
  return { message: `${input}. Какой объект? (введите название)` };
}

// Step 2: Object
function processObject(input: string, draft: Draft, stores: FlowStores): FlowResponse {
  const customer = draft.data.customer || "";
  const customerSlug = slugify(customer);
  const objects = stores.customers.getObjects(customerSlug);

  let objectName = input;

  // Check if input is a number (picking from list)
  const num = parseInt(input, 10);
  if (!isNaN(num) && num >= 1 && num <= objects.length) {
    objectName = objects[num - 1].name;
  }

  stores.drafts.update(draft.id, 3, { object: objectName, object_name: objectName });

  // Show last GNB number for this object if available
  const last = stores.transitions.getLastForObject(customer, objectName);
  const hint = last ? ` (последний — ${last.gnb_number})` : "";

  return { message: `${objectName}. Какой номер нового перехода?${hint}` };
}

// Step 3: GNB number
function processGnbNumber(input: string, draft: Draft, stores: FlowStores): FlowResponse {
  const parsed = parseGnbNumber(input);
  const customer = draft.data.customer || "";
  const object = draft.data.object || "";

  const idUpdate = {
    gnb_number: parsed.full,
    gnb_number_short: parsed.short,
    id: generateTransitionId(customer, object, parsed.short),
  };

  // Check if there's a previous transition to inherit from
  const last = stores.transitions.getLastForObject(customer, object);
  if (last) {
    stores.drafts.update(draft.id, 4, idUpdate);
    return {
      message: `${parsed.full}. Беру данные из ${last.gnb_number} как основу. Подтвердить? (да / с нуля)`,
    };
  }

  // No previous — skip based_on_previous, go to dates
  stores.drafts.update(draft.id, 5, idUpdate);
  return { message: promptForStep("dates", stores, draft.chat_id) };
}

// Step 4: Based on previous
function processBasedOn(input: string, draft: Draft, stores: FlowStores): FlowResponse {
  const lower = input.toLowerCase();
  if (lower === "да" || lower === "ок" || lower === "yes" || lower === "+") {
    // Inherit from last transition
    const customer = draft.data.customer || "";
    const object = draft.data.object || "";
    const last = stores.transitions.getLastForObject(customer, object);

    if (last) {
      // Copy inheritable fields
      const inherited: Partial<Transition> = {
        title_line: last.title_line,
        address: last.address,
        project_number: last.project_number,
        executor: last.executor,
        organizations: last.organizations,
        signatories: last.signatories,
        pipe: last.pipe,
        materials: last.materials,
      };
      stores.drafts.update(draft.id, 5, inherited);
      return { message: `Данные наследованы из ${last.gnb_number}.\n\n` + promptForStep("dates", stores, draft.chat_id) };
    }
  }

  // "С нуля" or no previous found
  stores.drafts.update(draft.id, 5, {});
  return { message: promptForStep("dates", stores, draft.chat_id) };
}

// Step 5: Dates (+ address if not inherited)
function processDates(input: string, draft: Draft, stores: FlowStores): FlowResponse {
  const updates: Partial<Transition> = {};

  // Try to find two dates
  const datePattern = /(\d{1,2}[./]\d{1,2}[./]\d{4})/g;
  const dates = input.match(datePattern);

  if (dates && dates.length >= 2) {
    try {
      updates.start_date = parseDate(dates[0]);
      updates.end_date = parseDate(dates[1]);
    } catch {
      return { message: "Не удалось разобрать даты. Формат: 10.12.2025 - 22.12.2025" };
    }
  } else if (dates && dates.length === 1) {
    return { message: "Нужны ДВЕ даты: начало и окончание. Формат: 10.12.2025 - 22.12.2025" };
  } else {
    return { message: "Не нашёл даты. Формат: 10.12.2025 - 22.12.2025 [адрес]" };
  }

  // Extract address: everything that's not a date or separator
  const addressPart = input
    .replace(datePattern, "")
    .replace(/начало|окончание|адрес[:\s]*/gi, "")
    .replace(/[-–,]/g, " ")
    .trim();

  if (addressPart && addressPart.length > 3) {
    let address = addressPart;
    if (!address.match(/^г\.|^город|^москва|^санкт/i)) {
      address = `г. Москва, ${address}`;
    }
    updates.address = address;
  }

  // Determine next step: skip orgs if inherited
  const freshData = { ...draft.data, ...updates };
  const hasOrgs = !!freshData.organizations;
  const nextStep = hasOrgs ? 7 : 6; // skip orgs if inherited
  const nextStepName = stepFromIndex(nextStep);

  stores.drafts.update(draft.id, nextStep, updates);
  const freshDraft = stores.drafts.get(draft.id);
  return { message: promptForStep(nextStepName, stores, draft.chat_id, freshDraft ?? undefined) };
}

// Step 6: Organizations (only if not inherited)
function processOrganizations(input: string, draft: Draft, stores: FlowStores): FlowResponse {
  if (input.toLowerCase().includes("те же") || input.toLowerCase().includes("пропустить") || isYes(input)) {
    stores.drafts.update(draft.id, 7, {});
    const freshDraft = stores.drafts.get(draft.id);
    return { message: promptForStep("signatories", stores, draft.chat_id, freshDraft ?? undefined) };
  }

  return {
    message:
      "На данном этапе организации задаются из предыдущего перехода.\n" +
      "Выберите основу на шаге 4 или введите 'пропустить' чтобы задать позже.\n" +
      "(Организации с полными реквизитами нужны для АОСР — можно настроить при генерации)",
  };
}

// Step 7: Signatories
function processSignatories(input: string, draft: Draft, stores: FlowStores): FlowResponse {
  const currentSignatories = draft.data.signatories;

  // "те же" — keep inherited signatories
  if (input.toLowerCase().includes("те же") || input.toLowerCase() === "ок" || isYes(input)) {
    if (currentSignatories) {
      stores.drafts.update(draft.id, 8, {});
      const freshDraft = stores.drafts.get(draft.id);
      return { message: promptForStep("pipe_and_gnb_params", stores, draft.chat_id, freshDraft ?? undefined) };
    }
    return { message: "Подписанты не заданы. Укажите хотя бы: технадзор, мастер, подрядчик." };
  }

  // Parse replacement syntax
  const replacements = parseSignatoryReplacements(input);

  if (replacements.length === 0) {
    return { message: "Не удалось разобрать. Формат: 'технадзор — Фамилия, мастер — Фамилия'" };
  }

  const messages: string[] = [];
  const updatedSignatories = currentSignatories ? { ...currentSignatories } : {} as any;
  const missingData: string[] = [];

  for (const { role, surname } of replacements) {
    const found = stores.people.findByName(surname);
    if (found.length > 0) {
      const person = found[0];
      const signatory = personToSignatory(person, role);
      if (role === "tech") updatedSignatories.tech_supervisor = signatory;
      else if (role === "sign1") updatedSignatories.sign1_customer = signatory;
      else if (role === "sign2") updatedSignatories.sign2_contractor = signatory;
      else if (role === "sign3") updatedSignatories.sign3_optional = signatory;
      messages.push(`✅ ${person.full_name} — ${person.position} (${person.organization})`);
    } else {
      missingData.push(surname);
      messages.push(`❌ ${surname} — не найден в базе.`);
    }
  }

  if (missingData.length > 0) {
    return {
      message:
        messages.join("\n") + "\n\n" +
        `Для отсутствующих нужны данные:\n` +
        `  1. Полные ФИО (Фамилия И.О.)?\n` +
        `  2. Должность?\n` +
        `  3. НРС-номер и дата? (для технадзора/подрядчика)\n` +
        `  4. Номер и дата приказа/распоряжения?\n` +
        `Или скиньте PDF распоряжения.\n\n` +
        `Пока можно ввести 'пропустить' чтобы задать позже.`,
    };
  }

  stores.drafts.update(draft.id, 8, { signatories: updatedSignatories });
  const freshDraft = stores.drafts.get(draft.id);
  return {
    message: messages.join("\n") + "\n\n" + promptForStep("pipe_and_gnb_params", stores, draft.chat_id, freshDraft ?? undefined),
  };
}

// Step 8: Pipe + GNB params
function processPipeAndParams(input: string, draft: Draft, stores: FlowStores): FlowResponse {
  const updates: Partial<Transition> = {};

  const gnbParams: any = { ...(draft.data.gnb_params || {}) };

  // Try structured parse first
  const profileMatch = input.match(/(?:l\s*проф|lпроф|профиль)[:\s]*(\d+[.,]?\d*)/i);
  const planMatch = input.match(/(?:l\s*план|lплан|план)[:\s]*(\d+[.,]?\d*)/i);
  const countMatch = input.match(/(\d+)\s*(?:труб|шт)/i);
  const diameterMatch = input.match(/(?:d|д|диаметр)[:\s=]*(\d+)/i);

  // Fallback: positional numbers
  const numbers = input.match(/[\d]+[.,]?\d*/g)?.map((n) => parseFloat(n.replace(",", "."))) || [];

  if (profileMatch) gnbParams.profile_length = parseFloat(profileMatch[1].replace(",", "."));
  else if (numbers.length >= 1 && !gnbParams.profile_length) gnbParams.profile_length = numbers[0];

  if (planMatch) gnbParams.plan_length = parseFloat(planMatch[1].replace(",", "."));
  else if (numbers.length >= 2) gnbParams.plan_length = numbers[1];

  if (countMatch) gnbParams.pipe_count = parseInt(countMatch[1], 10);
  else if (numbers.length >= 3) gnbParams.pipe_count = numbers[2];
  else if (!gnbParams.pipe_count) gnbParams.pipe_count = 2; // default

  if (diameterMatch) gnbParams.drill_diameter = parseInt(diameterMatch[1], 10);

  if (!gnbParams.profile_length) {
    return { message: "L профиль — обязательный параметр. Формат: 'Lпроф 194.67'" };
  }

  updates.gnb_params = gnbParams;

  // Pipe mark — check if there's text that looks like pipe info
  const pipeMatch = input.match(/(труба\s+.+?)(?:,|$)/i) || input.match(/(электропайп.+?)(?:,|$)/i);
  if (pipeMatch) {
    updates.pipe = {
      ...(draft.data.pipe || { mark: "", diameter: "", diameter_mm: 0 }),
      mark: pipeMatch[1].trim(),
    };
  }

  stores.drafts.update(draft.id, 9, updates);
  const freshDraft = stores.drafts.get(draft.id);
  return { message: promptForStep("review_confirm", stores, draft.chat_id, freshDraft ?? undefined) };
}

// Step 9: Review + confirm
function processReviewConfirm(input: string, draft: Draft, stores: FlowStores): FlowResponse {
  if (isYes(input)) {
    // Validate and finalize
    const report = validateTransition(draft.data as Partial<Transition>);
    const blockers = getBlockers(report);

    if (blockers.length > 0) {
      const blockerList = blockers.map((b) => `  ❌ ${b.message}`).join("\n");
      return {
        message: `Есть блокирующие проблемы:\n${blockerList}\n\nИсправьте данные и повторите /new_gnb.`,
      };
    }

    const result = finalizeDraft(draft, stores);
    if (!result) {
      return { message: "Ошибка финализации. Проверьте данные." };
    }

    let msg = `✅ Переход ${result.transition.gnb_number} сохранён.\nID: ${result.transition.id}`;
    if (result.warnings.length > 0) {
      msg += `\n\nПредупреждения:\n${result.warnings.map((w) => `  ⚠️ ${w}`).join("\n")}`;
    }

    return { message: msg, done: true, transition: result.transition };
  }

  if (input.toLowerCase() === "нет") {
    return { message: "Ок. Черновик сохранён. Используйте /new_gnb чтобы продолжить или /cancel для отмены." };
  }

  return { message: "Подтвердите: да / нет" };
}

// ─── Helpers ─────────────────────────────────────────────────

function isYes(input: string): boolean {
  const lower = input.toLowerCase().trim();
  return ["да", "ок", "yes", "давай", "подтверждаю", "+"].includes(lower);
}

function draftSummaryLine(draft: Draft): string {
  const d = draft.data;
  const parts: string[] = [];
  if (d.customer) parts.push(d.customer);
  if (d.object) parts.push(d.object);
  if (d.gnb_number) parts.push(d.gnb_number);
  return parts.length > 0 ? parts.join(" / ") : "без данных";
}

function stepLabel(step: FlowStep): string {
  const labels: Record<FlowStep, string> = {
    customer: "заказчик",
    object: "объект",
    gnb_number: "номер перехода",
    based_on_previous: "основа",
    dates: "даты + адрес",
    organizations: "организации",
    signatories: "подписанты",
    pipe_and_gnb_params: "труба + параметры ГНБ",
    review_confirm: "проверка",
    resume_prompt: "продолжение",
  };
  return labels[step] || step;
}

function promptForStep(step: FlowStep, stores: FlowStores, chatId: number, draft?: Draft): string {
  switch (step) {
    case "customer":
      return "Новый ГНБ-переход. Кто заказчик?";
    case "object":
      return `${draft?.data.customer || "—"}. Какой объект?`;
    case "gnb_number": {
      const last = draft?.data.customer && draft?.data.object
        ? stores.transitions.getLastForObject(draft.data.customer, draft.data.object)
        : null;
      const hint = last ? ` (последний — ${last.gnb_number})` : "";
      return `Какой номер нового перехода?${hint}`;
    }
    case "based_on_previous":
      return "Использовать данные из предыдущего перехода? (да / с нуля)";
    case "dates": {
      const hasAddress = !!draft?.data.address;
      const base = "Даты работ? (начало и окончание, формат: 10.12.2025 - 22.12.2025)";
      return hasAddress ? base : base + "\nАдрес? (можно в той же строке)";
    }
    case "organizations":
      return "Организации (заказчик, подрядчик, проектировщик).\nЕсли те же что обычно — 'те же'.";
    case "signatories": {
      if (draft?.data.signatories) {
        const s = draft.data.signatories;
        const lines = ["Подписанты из основы:"];
        if (s.sign1_customer) lines.push(`  1. ${s.sign1_customer.org_description} — ${s.sign1_customer.full_name}, ${s.sign1_customer.position}`);
        if (s.sign2_contractor) lines.push(`  2. ${s.sign2_contractor.org_description} — ${s.sign2_contractor.full_name}, ${s.sign2_contractor.position}`);
        if (s.sign3_optional) lines.push(`  3. ${s.sign3_optional.org_description} — ${s.sign3_optional.full_name}, ${s.sign3_optional.position}`);
        if (s.tech_supervisor) lines.push(`  4. Технадзор — ${s.tech_supervisor.full_name}, ${s.tech_supervisor.position}`);
        lines.push("Те же или кого меняем? (формат: 'технадзор — Фамилия')");
        return lines.join("\n");
      }
      return "Подписанты:\n  Мастер РЭС (sign1)?\n  Подрядчик (sign2)?\n  Субподрядчик (sign3, опц.)?\n  Технадзор?\nФормат: 'технадзор — Фамилия, мастер — Фамилия'";
    }
    case "pipe_and_gnb_params": {
      if (draft?.data.pipe) {
        return `Параметры ГНБ (труба: ${draft.data.pipe.mark}):\n  L проф? L план? Кол-во труб (по умолчанию 2)? Диаметр скважины?`;
      }
      return "Параметры ГНБ:\n  L проф? L план? Кол-во труб (по умолчанию 2)? Диаметр? Марка трубы?";
    }
    case "review_confirm": {
      if (draft) {
        const summary = buildReviewSummary(draft);
        const report = validateTransition(draft.data as Partial<Transition>);
        const blockers = getBlockers(report);
        const warnings = getWarnings(report);
        const confirms = getConfirms(report);

        let msg = summary;

        if (blockers.length > 0) {
          msg += `\n\n❌ Блокеры:\n${blockers.map((b) => `  • ${b.message}`).join("\n")}`;
          msg += "\n\nИсправьте данные перед подтверждением.";
        }
        if (warnings.length > 0) {
          msg += `\n\n⚠️ Предупреждения:\n${warnings.map((w) => `  • ${w.message}`).join("\n")}`;
        }
        if (confirms.length > 0) {
          msg += `\n\nℹ️ Подтвердите:\n${confirms.map((c) => `  • ${c.message}`).join("\n")}`;
        }

        if (blockers.length === 0) {
          msg += "\n\nСохранить переход? (да / нет)";
        }
        return msg;
      }
      return "Проверка данных...";
    }
    default:
      return "";
  }
}

/** Parse "технадзор — Гайдуков, мастер — Коробков" into role+surname pairs. */
function parseSignatoryReplacements(input: string): Array<{ role: string; surname: string }> {
  const results: Array<{ role: string; surname: string }> = [];
  const roleMap: Record<string, string> = {
    "технадзор": "tech",
    "тн": "tech",
    "мастер": "sign1",
    "рэс": "sign1",
    "подрядчик": "sign2",
    "субподрядчик": "sign3",
    "суб": "sign3",
  };

  const parts = input.split(/[,;]+/);
  for (const part of parts) {
    const match = part.match(/^\s*([\wа-яё]+)\s*[-—:=]\s*([\wа-яё.]+)/i);
    if (match) {
      const roleKey = match[1].toLowerCase();
      const role = roleMap[roleKey];
      if (role) {
        results.push({ role, surname: match[2] });
      }
    }
  }

  return results;
}

/** Convert Person from PeopleStore to a Signatory for use in draft. */
function personToSignatory(person: import("../domain/types.js").Person, role: string): import("../domain/types.js").Signatory {
  return {
    person_id: person.person_id,
    role: role as import("../domain/types.js").SignatoryRole,
    org_description: person.organization,
    position: person.position,
    full_name: person.full_name,
    nrs_id: person.nrs_id,
    nrs_date: person.nrs_date,
    order_type: person.order_type,
    order_number: person.order_number,
    order_date: person.order_date,
    aosr_full_line: person.aosr_full_line,
  };
}
