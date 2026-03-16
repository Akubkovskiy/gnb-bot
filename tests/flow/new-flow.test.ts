import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { DraftStore } from "../../src/store/drafts.js";
import { TransitionStore } from "../../src/store/transitions.js";
import { CustomerStore } from "../../src/store/customers.js";
import { PeopleStore } from "../../src/store/people.js";
import type { FlowStores } from "../../src/flow/flow-types.js";
import {
  startFlow,
  handleInput,
  getActiveDraft,
  buildReviewSummary,
  finalizeDraft,
} from "../../src/flow/new-flow.js";
import type { Transition, Person, Customer, Draft } from "../../src/domain/types.js";

let tmpDir: string;
let stores: FlowStores;

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "gnb-flow-test-"));
}

function makeStores(dir: string): FlowStores {
  return {
    drafts: new DraftStore(dir),
    transitions: new TransitionStore(dir),
    customers: new CustomerStore(dir),
    people: new PeopleStore(dir),
  };
}

const CHAT_ID = 12345;

/** Seed a customer with an object in CustomerStore. */
function seedCustomer(s: FlowStores): void {
  s.customers.add({
    slug: "kraft",
    name: "Крафт",
    aliases: ["крафт", "kraft"],
    objects: {
      marino: { name: "Марьино", path: "Крафт/Марьино" },
    },
  });
}

/** Seed a person in PeopleStore. */
function seedPeople(s: FlowStores): void {
  s.people.add({
    person_id: "gaydukov-ni",
    full_name: "Гайдуков Н.И.",
    position: "Главный специалист ОТН",
    organization: "АО «ОЭК»",
    role: "tech",
    nrs_id: "C-71-259039",
    nrs_date: "23.09.2022",
    order_type: "распоряжение",
    order_number: "01/3349-р",
    order_date: "14.10.2024",
    aosr_full_line: "Главный специалист ОТН АО «ОЭК» Гайдуков Н.И.",
  });
  s.people.add({
    person_id: "korobkov-yun",
    full_name: "Коробков Ю.Н.",
    position: "Мастер по ЭРС СВРЭС",
    organization: "АО «ОЭК»",
    role: "sign1",
    aosr_full_line: "Мастер по ЭРС СВРЭС АО «ОЭК» Коробков Ю.Н.",
  });
}

/** Seed a previous transition for inheritance testing. */
function seedTransition(s: FlowStores): void {
  s.transitions.create({
    id: "kraft-marino-3",
    status: "finalized",
    created_at: "2025-12-01T00:00:00.000Z",
    finalized_at: "2025-12-01T00:00:00.000Z",
    customer: "Крафт",
    object: "Марьино",
    gnb_number: "ЗП № 3",
    gnb_number_short: "3",
    title_line: "Строительство КЛ 10кВ методом ГНБ",
    object_name: "Марьино",
    address: "г. Москва, Огородный проезд, д. 11",
    project_number: "ШФ-123",
    executor: "ООО «СПЕЦИНЖСТРОЙ»",
    start_date: { day: 1, month: "декабря", year: 2025 },
    end_date: { day: 10, month: "декабря", year: 2025 },
    refs: { person_ids: [], org_ids: [] },
    organizations: {
      customer: { id: "oek", name: "АО «ОЭК»", short_name: "АО «ОЭК»", department: "СВРЭС", ogrn: "1", inn: "2", legal_address: "addr", phone: "123", sro_name: "sro" },
      contractor: { id: "st", name: "АНО «ОЭК Стройтрест»", ogrn: "1", inn: "2", legal_address: "addr", phone: "123", sro_name: "sro" },
      designer: { id: "si", name: "ООО «СПЕЦИНЖСТРОЙ»", ogrn: "1", inn: "2", legal_address: "addr", phone: "123", sro_name: "sro" },
    },
    signatories: {
      sign1_customer: { person_id: "korobkov-yun", role: "sign1", org_description: "Представитель АО «ОЭК»", position: "Мастер по ЭРС СВРЭС", full_name: "Коробков Ю.Н.", aosr_full_line: "..." },
      sign2_contractor: { person_id: "buryak-am", role: "sign2", org_description: "Подрядчик", position: "Начальник участка", full_name: "Буряк А.М.", aosr_full_line: "..." },
      tech_supervisor: { person_id: "gaydukov-ni", role: "tech", org_description: "Технадзор", position: "Главный специалист ОТН", full_name: "Гайдуков Н.И.", aosr_full_line: "..." },
    },
    pipe: { mark: "Труба ЭЛЕКТРОПАЙП 225/170", diameter: "d=225", diameter_mm: 225 },
    gnb_params: { profile_length: 63.3, pipe_count: 2 },
    source_docs: [],
    generated_files: [],
    revisions: [],
  });
}

beforeEach(() => {
  tmpDir = makeTmpDir();
  stores = makeStores(tmpDir);
});

afterEach(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ─── Start flow ──────────────────────────────────────────────

describe("startFlow", () => {
  it("creates a draft and prompts for customer when no existing draft", () => {
    const result = startFlow(CHAT_ID, stores);
    expect(result.message).toContain("Кто заказчик");
    expect(stores.drafts.listActive().length).toBe(1);
  });

  it("shows resume prompt when draft already exists", () => {
    stores.drafts.create("test-draft", CHAT_ID, 3, { customer: "Крафт", object: "Марьино" });
    const result = startFlow(CHAT_ID, stores);
    expect(result.message).toContain("незавершённый черновик");
    expect(result.message).toContain("Крафт");
    expect(result.message).toContain("Продолжить");
  });
});

// ─── Resume / Discard ────────────────────────────────────────

describe("resume/discard existing draft", () => {
  it("resumes draft on 'да' and re-prompts current step", () => {
    stores.drafts.create("test-draft", CHAT_ID, 3, { customer: "Крафт", object: "Марьино" });
    startFlow(CHAT_ID, stores); // shows resume prompt
    const result = handleInput(CHAT_ID, "да", stores);
    expect(result).not.toBeNull();
    expect(result!.message).toContain("номер"); // step 3 = gnb_number
  });

  it("discards draft on 'нет' and starts fresh", () => {
    stores.drafts.create("test-draft", CHAT_ID, 3, { customer: "Крафт" });
    startFlow(CHAT_ID, stores);
    const result = handleInput(CHAT_ID, "нет", stores);
    expect(result).not.toBeNull();
    expect(result!.message).toContain("удалён");
    expect(result!.message).toContain("Кто заказчик");
    // Old draft deleted, new one created
    const drafts = stores.drafts.listActive();
    expect(drafts.length).toBe(1);
    expect(drafts[0].step).toBe(1);
  });
});

// ─── Step transitions (happy path) ──────────────────────────

describe("step-by-step flow", () => {
  it("step 1: customer → step 2: object (known customer)", () => {
    seedCustomer(stores);
    startFlow(CHAT_ID, stores);
    const result = handleInput(CHAT_ID, "Крафт", stores);
    expect(result!.message).toContain("Крафт");
    expect(result!.message).toContain("Марьино");
    expect(stores.drafts.getByChatId(CHAT_ID)!.step).toBe(2);
  });

  it("step 1: customer → step 2: object (new customer)", () => {
    startFlow(CHAT_ID, stores);
    const result = handleInput(CHAT_ID, "НовыйЗаказчик", stores);
    expect(result!.message).toContain("НовыйЗаказчик");
    expect(result!.message).toContain("объект");
  });

  it("step 2: object by number from list", () => {
    seedCustomer(stores);
    startFlow(CHAT_ID, stores);
    handleInput(CHAT_ID, "Крафт", stores);
    const result = handleInput(CHAT_ID, "1", stores); // pick first from list
    expect(result!.message).toContain("Марьино");
    expect(result!.message).toContain("номер");
    expect(stores.drafts.getByChatId(CHAT_ID)!.step).toBe(3);
  });

  it("step 2: object by name", () => {
    startFlow(CHAT_ID, stores);
    handleInput(CHAT_ID, "Крафт", stores);
    const result = handleInput(CHAT_ID, "Огородный", stores);
    expect(result!.message).toContain("номер");
    expect(stores.drafts.getByChatId(CHAT_ID)!.data.object).toBe("Огородный");
  });

  it("step 3: gnb_number → based_on_previous prompt (with previous transition)", () => {
    seedCustomer(stores);
    seedTransition(stores);
    startFlow(CHAT_ID, stores);
    handleInput(CHAT_ID, "Крафт", stores);
    handleInput(CHAT_ID, "Марьино", stores);
    const result = handleInput(CHAT_ID, "5-5", stores);
    expect(result!.message).toContain("ЗП № 5-5");
    expect(result!.message).toContain("ЗП № 3");
    expect(result!.message).toContain("основу");
    expect(stores.drafts.getByChatId(CHAT_ID)!.step).toBe(4);
  });

  it("step 3: gnb_number → skips based_on_previous when no prior transition", () => {
    startFlow(CHAT_ID, stores);
    handleInput(CHAT_ID, "Крафт", stores);
    handleInput(CHAT_ID, "Марьино", stores);
    const result = handleInput(CHAT_ID, "5-5", stores);
    // Should jump to dates (step 5)
    expect(result!.message).toContain("Дат");
    expect(stores.drafts.getByChatId(CHAT_ID)!.step).toBe(5);
  });

  it("step 4: based_on_previous 'да' → inherits data, goes to dates", () => {
    seedCustomer(stores);
    seedTransition(stores);
    startFlow(CHAT_ID, stores);
    handleInput(CHAT_ID, "Крафт", stores);
    handleInput(CHAT_ID, "Марьино", stores);
    handleInput(CHAT_ID, "5-5", stores);
    const result = handleInput(CHAT_ID, "да", stores);
    expect(result!.message).toContain("наследованы");
    expect(result!.message).toContain("Дат");

    const draft = stores.drafts.getByChatId(CHAT_ID)!;
    expect(draft.step).toBe(5);
    expect(draft.data.address).toBe("г. Москва, Огородный проезд, д. 11");
    expect(draft.data.signatories?.sign1_customer?.full_name).toBe("Коробков Ю.Н.");
  });

  it("step 4: based_on_previous 'с нуля' → no inheritance", () => {
    seedCustomer(stores);
    seedTransition(stores);
    startFlow(CHAT_ID, stores);
    handleInput(CHAT_ID, "Крафт", stores);
    handleInput(CHAT_ID, "Марьино", stores);
    handleInput(CHAT_ID, "5-5", stores);
    const result = handleInput(CHAT_ID, "с нуля", stores);
    expect(result!.message).toContain("Дат");
    expect(stores.drafts.getByChatId(CHAT_ID)!.data.address).toBeUndefined();
  });

  it("step 5: dates parsing with two dates and address", () => {
    startFlow(CHAT_ID, stores);
    handleInput(CHAT_ID, "Крафт", stores);
    handleInput(CHAT_ID, "Марьино", stores);
    handleInput(CHAT_ID, "5-5", stores); // no prior → jumps to step 5

    const result = handleInput(CHAT_ID, "10.12.2025 - 22.12.2025 Огородный д.11", stores);
    const draft = stores.drafts.getByChatId(CHAT_ID)!;
    expect(draft.data.start_date).toEqual({ day: 10, month: "декабря", year: 2025 });
    expect(draft.data.end_date).toEqual({ day: 22, month: "декабря", year: 2025 });
    expect(draft.data.address).toContain("Огородный");
  });

  it("step 5: dates parsing error on missing second date", () => {
    startFlow(CHAT_ID, stores);
    handleInput(CHAT_ID, "Крафт", stores);
    handleInput(CHAT_ID, "Марьино", stores);
    handleInput(CHAT_ID, "5-5", stores);

    const result = handleInput(CHAT_ID, "10.12.2025", stores);
    expect(result!.message).toContain("ДВЕ даты");
  });

  it("step 7: signatories 'те же' when inherited", () => {
    seedCustomer(stores);
    seedTransition(stores);
    startFlow(CHAT_ID, stores);
    handleInput(CHAT_ID, "Крафт", stores);
    handleInput(CHAT_ID, "Марьино", stores);
    handleInput(CHAT_ID, "5-5", stores);
    handleInput(CHAT_ID, "да", stores); // inherit
    handleInput(CHAT_ID, "10.12.2025 - 22.12.2025", stores); // dates → skips orgs (inherited)

    const draft = stores.drafts.getByChatId(CHAT_ID)!;
    expect(draft.step).toBe(7); // signatories step

    const result = handleInput(CHAT_ID, "те же", stores);
    expect(stores.drafts.getByChatId(CHAT_ID)!.step).toBe(8); // pipe_and_gnb_params
  });

  it("step 7: signatories replacement lookup", () => {
    seedCustomer(stores);
    seedTransition(stores);
    seedPeople(stores);
    startFlow(CHAT_ID, stores);
    handleInput(CHAT_ID, "Крафт", stores);
    handleInput(CHAT_ID, "Марьино", stores);
    handleInput(CHAT_ID, "5-5", stores);
    handleInput(CHAT_ID, "да", stores);
    handleInput(CHAT_ID, "10.12.2025 - 22.12.2025", stores);

    const result = handleInput(CHAT_ID, "технадзор — Гайдуков, мастер — Коробков", stores);
    expect(result!.message).toContain("✅ Гайдуков");
    expect(result!.message).toContain("✅ Коробков");
    expect(stores.drafts.getByChatId(CHAT_ID)!.step).toBe(8);
  });

  it("step 7: signatories not found in people store", () => {
    seedCustomer(stores);
    seedTransition(stores);
    startFlow(CHAT_ID, stores);
    handleInput(CHAT_ID, "Крафт", stores);
    handleInput(CHAT_ID, "Марьино", stores);
    handleInput(CHAT_ID, "5-5", stores);
    handleInput(CHAT_ID, "да", stores);
    handleInput(CHAT_ID, "10.12.2025 - 22.12.2025", stores);

    const result = handleInput(CHAT_ID, "технадзор — Несуществующий", stores);
    expect(result!.message).toContain("❌ Несуществующий");
    expect(result!.message).toContain("не найден");
    // Should NOT advance step — stays on signatories
  });

  it("step 8: pipe and gnb params parsing", () => {
    seedCustomer(stores);
    seedTransition(stores);
    startFlow(CHAT_ID, stores);
    handleInput(CHAT_ID, "Крафт", stores);
    handleInput(CHAT_ID, "Марьино", stores);
    handleInput(CHAT_ID, "5-5", stores);
    handleInput(CHAT_ID, "да", stores);
    handleInput(CHAT_ID, "10.12.2025 - 22.12.2025", stores);
    handleInput(CHAT_ID, "те же", stores); // signatories

    const result = handleInput(CHAT_ID, "Lпроф 194.67, Lплан 61.7, 2 труб, d350", stores);
    const draft = stores.drafts.getByChatId(CHAT_ID)!;
    expect(draft.step).toBe(9);
    expect(draft.data.gnb_params?.profile_length).toBe(194.67);
    expect(draft.data.gnb_params?.plan_length).toBe(61.7);
    expect(draft.data.gnb_params?.pipe_count).toBe(2);
    expect(draft.data.gnb_params?.drill_diameter).toBe(350);
  });

  it("step 8: missing profile_length returns error", () => {
    seedCustomer(stores);
    seedTransition(stores);
    startFlow(CHAT_ID, stores);
    handleInput(CHAT_ID, "Крафт", stores);
    handleInput(CHAT_ID, "Марьино", stores);
    handleInput(CHAT_ID, "5-5", stores);
    handleInput(CHAT_ID, "да", stores);
    handleInput(CHAT_ID, "10.12.2025 - 22.12.2025", stores);
    handleInput(CHAT_ID, "те же", stores);

    const result = handleInput(CHAT_ID, "нет данных", stores);
    expect(result!.message).toContain("L профиль");
  });
});

// ─── Review and confirm ──────────────────────────────────────

describe("review_confirm step", () => {
  function driveToReview(): void {
    seedCustomer(stores);
    seedTransition(stores);
    seedPeople(stores);
    startFlow(CHAT_ID, stores);
    handleInput(CHAT_ID, "Крафт", stores);
    handleInput(CHAT_ID, "Марьино", stores);
    handleInput(CHAT_ID, "5-5", stores);
    handleInput(CHAT_ID, "да", stores); // inherit
    handleInput(CHAT_ID, "10.12.2025 - 22.12.2025 Огородный д.11", stores);
    handleInput(CHAT_ID, "те же", stores); // signatories
    handleInput(CHAT_ID, "Lпроф 194.67, Lплан 61.7, 2 труб", stores); // params
  }

  it("shows summary with validation report at review step", () => {
    driveToReview();
    const draft = stores.drafts.getByChatId(CHAT_ID)!;
    expect(draft.step).toBe(9);

    // The prompt for step 9 already includes summary
    // Re-trigger by sending something that's not yes/no
    const result = handleInput(CHAT_ID, "?", stores);
    expect(result!.message).toContain("да / нет");
  });

  it("confirm 'да' finalizes draft into transition", () => {
    driveToReview();
    const result = handleInput(CHAT_ID, "да", stores);
    expect(result!.message).toContain("✅");
    expect(result!.message).toContain("сохранён");
    expect(result!.done).toBe(true);

    // Draft should be deleted
    expect(stores.drafts.getByChatId(CHAT_ID)).toBeNull();

    // Transition should exist
    const transitions = stores.transitions.list();
    expect(transitions.length).toBe(2); // seeded + new
    const newT = transitions.find(t => t.gnb_number_short === "5-5");
    expect(newT).toBeDefined();
    expect(newT!.customer).toBe("Крафт");
    expect(newT!.object).toBe("Марьино");
  });

  it("confirm 'нет' keeps draft alive", () => {
    driveToReview();
    const result = handleInput(CHAT_ID, "нет", stores);
    expect(result!.message).toContain("сохранён");
    expect(result!.done).toBeUndefined();
    expect(stores.drafts.getByChatId(CHAT_ID)).not.toBeNull();
  });
});

// ─── Cancel ──────────────────────────────────────────────────

describe("cancel flow", () => {
  it("/cancel deletes draft", () => {
    startFlow(CHAT_ID, stores);
    const result = handleInput(CHAT_ID, "/cancel", stores);
    expect(result!.message).toContain("отменён");
    expect(result!.done).toBe(true);
    expect(stores.drafts.getByChatId(CHAT_ID)).toBeNull();
  });

  it("'отмена' deletes draft", () => {
    startFlow(CHAT_ID, stores);
    handleInput(CHAT_ID, "Крафт", stores);
    const result = handleInput(CHAT_ID, "отмена", stores);
    expect(result!.message).toContain("отменён");
    expect(stores.drafts.getByChatId(CHAT_ID)).toBeNull();
  });
});

// ─── No active draft ────────────────────────────────────────

describe("no active draft behavior", () => {
  it("handleInput returns null when no draft", () => {
    const result = handleInput(CHAT_ID, "random text", stores);
    expect(result).toBeNull();
  });
});

// ─── buildReviewSummary ──────────────────────────────────────

describe("buildReviewSummary", () => {
  it("builds summary from draft data", () => {
    const draft: Draft = {
      id: "test",
      step: 9,
      chat_id: CHAT_ID,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      data: {
        customer: "Крафт",
        object: "Марьино",
        gnb_number: "ЗП № 5-5",
        address: "г. Москва, Огородный проезд, д. 11",
        start_date: { day: 10, month: "декабря", year: 2025 },
        end_date: { day: 22, month: "декабря", year: 2025 },
        gnb_params: { profile_length: 194.67, pipe_count: 2, plan_length: 61.7 },
      },
    };
    const summary = buildReviewSummary(draft);
    expect(summary).toContain("ЗП № 5-5");
    expect(summary).toContain("Крафт");
    expect(summary).toContain("Марьино");
    expect(summary).toContain("194.67");
  });
});

// ─── finalizeDraft ───────────────────────────────────────────

describe("finalizeDraft", () => {
  it("returns null when validation has blockers", () => {
    const draft: Draft = {
      id: "test",
      step: 9,
      chat_id: CHAT_ID,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      data: { customer: "Крафт" }, // missing many required fields
    };
    const result = finalizeDraft(draft, stores);
    expect(result).toBeNull();
  });

  it("creates transition and deletes draft on success", () => {
    seedTransition(stores); // need the orgs/signatories data

    const baseTr = stores.transitions.get("kraft-marino-3")!;
    const draft: Draft = {
      id: "test-final",
      step: 9,
      chat_id: CHAT_ID,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      data: {
        customer: "Крафт",
        object: "Марьино",
        gnb_number: "ЗП № 5-5",
        gnb_number_short: "5-5",
        title_line: "test",
        object_name: "Марьино",
        address: "г. Москва, test",
        project_number: "ШФ-1",
        executor: "test",
        start_date: { day: 1, month: "декабря", year: 2025 },
        end_date: { day: 10, month: "декабря", year: 2025 },
        organizations: baseTr.organizations,
        signatories: baseTr.signatories,
        pipe: baseTr.pipe,
        gnb_params: { profile_length: 100, pipe_count: 2 },
      },
    };

    // Create draft in store first
    stores.drafts.create(draft.id, draft.chat_id, draft.step, draft.data);

    const result = finalizeDraft(stores.drafts.get(draft.id)!, stores);
    expect(result).not.toBeNull();
    expect(result!.transition.customer).toBe("Крафт");
    expect(result!.transition.status).toBe("finalized");

    // Draft should be deleted
    expect(stores.drafts.get(draft.id)).toBeNull();

    // Transition should be in store
    const found = stores.transitions.list().find(t => t.gnb_number_short === "5-5");
    expect(found).toBeDefined();
  });
});

// ─── Empty stores (backward-safe) ───────────────────────────

describe("backward-safe on empty stores", () => {
  it("startFlow works with completely empty stores", () => {
    const result = startFlow(CHAT_ID, stores);
    expect(result.message).toContain("Кто заказчик");
  });

  it("full flow without any seeded data works", () => {
    startFlow(CHAT_ID, stores);
    handleInput(CHAT_ID, "Тест", stores);
    handleInput(CHAT_ID, "Объект1", stores);
    const r3 = handleInput(CHAT_ID, "1-1", stores);
    // No previous transition → jumps to dates
    expect(r3!.message).toContain("Дат");
    expect(stores.drafts.getByChatId(CHAT_ID)!.step).toBe(5);
  });
});
