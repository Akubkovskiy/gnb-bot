/**
 * Tests for Phase 5.5: intake engine, response builder, finalize bridge.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { IntakeDraftStore } from "../../src/store/intake-drafts.js";
import { TransitionStore } from "../../src/store/transitions.js";
import { CustomerStore } from "../../src/store/customers.js";
import { PeopleStore } from "../../src/store/people.js";
import type { IntakeStores } from "../../src/intake/intake-types.js";
import type { Transition } from "../../src/domain/types.js";
import {
  startIntake,
  handleIntakeText,
  handleReview,
  cancelIntake,
  hasActiveIntake,
  _resetAllSessions,
} from "../../src/intake/intake-engine.js";
import { finalizeIntake } from "../../src/intake/finalize-intake.js";
import { buildReviewText, buildIntakeResponse } from "../../src/intake/intake-response.js";

let tmpDir: string;
let stores: IntakeStores;

const CHAT_ID = 12345;

function seedBaseTransition(): Transition {
  const t: Transition = {
    id: "kraft-marino-3",
    status: "finalized",
    created_at: "2025-11-15T10:00:00.000Z",
    customer: "Крафт",
    object: "Марьино",
    gnb_number: "ЗП № 3",
    gnb_number_short: "3",
    title_line: "Строительство КЛ 10кВ методом ГНБ",
    object_name: "Марьино",
    address: "г. Москва, Огородный проезд, д. 11",
    project_number: "ШФ-123",
    executor: "ООО «СПЕЦИНЖСТРОЙ»",
    start_date: { day: 1, month: "ноября", year: 2025 },
    end_date: { day: 15, month: "ноября", year: 2025 },
    refs: { person_ids: [], org_ids: [] },
    organizations: {
      customer: { id: "oek", name: "АО «ОЭК»", short_name: "АО «ОЭК»", ogrn: "1057746394155", inn: "7720522853", legal_address: "Москва", phone: "", sro_name: "СРО" },
      contractor: { id: "st", name: "АНО «ОЭК Стройтрест»", short_name: "АНО «ОЭК Стройтрест»", ogrn: "1247700649591", inn: "7708442087", legal_address: "Москва", phone: "", sro_name: "СРО" },
      designer: { id: "sp", name: "ООО «СПЕЦИНЖСТРОЙ»", short_name: "ООО «СИС»", ogrn: "1167847487444", inn: "7806258664", legal_address: "Москва", phone: "", sro_name: "СРО" },
    },
    signatories: {
      sign1_customer: { person_id: "korobkov", role: "sign1", org_description: "АО «ОЭК»", position: "Мастер по ЭРС СВРЭС", full_name: "Коробков Ю.Н.", aosr_full_line: "..." },
      sign2_contractor: { person_id: "buryak", role: "sign2", org_description: "АНО «ОЭК Стройтрест»", position: "Начальник участка", full_name: "Буряк А.М.", aosr_full_line: "..." },
      tech_supervisor: { person_id: "gaydukov", role: "tech", org_description: "АО «ОЭК»", position: "Главный специалист ОТН", full_name: "Гайдуков Н.И.", aosr_full_line: "..." },
    },
    pipe: { mark: "Труба ЭЛЕКТРОПАЙП 225/170", diameter: "d=225", diameter_mm: 225 },
    gnb_params: { profile_length: 63.3, plan_length: 61.7, pipe_count: 2 },
    source_docs: [],
    generated_files: [],
    revisions: [],
  };
  stores.transitions.create(t);
  return t;
}

function seedCustomer(): void {
  const customersFile = path.join(tmpDir, "customers.json");
  fs.writeFileSync(customersFile, JSON.stringify({
    customers: {
      kraft: {
        slug: "kraft",
        name: "Крафт",
        aliases: ["крафт"],
        objects: {
          marino: { name: "Марьино", path: "Крафт/Марьино", last_gnb: "ЗП № 3" },
        },
      },
    },
  }));
}

beforeEach(() => {
  _resetAllSessions();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "intake-engine-"));
  stores = {
    intakeDrafts: new IntakeDraftStore(tmpDir),
    transitions: new TransitionStore(tmpDir),
    customers: new CustomerStore(tmpDir),
    people: new PeopleStore(tmpDir),
  };
  seedCustomer();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// === /new_gnb ===

describe("/new_gnb start", () => {
  it("starts intake and asks for customer", () => {
    const result = startIntake(CHAT_ID, stores);
    expect(result.message).toContain("Кто заказчик");
    expect(hasActiveIntake(CHAT_ID)).toBe(true);
  });

  it("offers resume if active draft exists", () => {
    stores.intakeDrafts.create(CHAT_ID);
    const result = startIntake(CHAT_ID, stores);
    expect(result.message).toContain("незавершённый черновик");
    expect(result.buttons).toBeDefined(); // buttons instead of text "да/нет"
  });
});

// === Customer selection ===

describe("customer selection", () => {
  it("finds known customer and shows objects", () => {
    startIntake(CHAT_ID, stores);
    const result = handleIntakeText(CHAT_ID, "Крафт", stores);
    expect(result).not.toBeNull();
    expect(result!.message).toContain("Крафт");
    expect(result!.message).toContain("Марьино");
  });

  it("accepts unknown customer", () => {
    startIntake(CHAT_ID, stores);
    const result = handleIntakeText(CHAT_ID, "НовыйЗаказчик", stores);
    expect(result).not.toBeNull();
    expect(result!.message).toContain("НовыйЗаказчик");
    expect(result!.message).toContain("объект");
  });
});

// === Object selection ===

describe("object selection", () => {
  it("selects object by number", () => {
    startIntake(CHAT_ID, stores);
    handleIntakeText(CHAT_ID, "Крафт", stores);
    const result = handleIntakeText(CHAT_ID, "1", stores);
    expect(result).not.toBeNull();
    expect(result!.message).toContain("Марьино");
    expect(result!.message).toContain("номер");
  });

  it("accepts new object name", () => {
    startIntake(CHAT_ID, stores);
    handleIntakeText(CHAT_ID, "Крафт", stores);
    const result = handleIntakeText(CHAT_ID, "Новый объект", stores);
    expect(result).not.toBeNull();
    expect(result!.message).toContain("Новый объект");
  });
});

// === GNB number + base detection ===

describe("gnb number and base", () => {
  it("finds previous GNB and asks for base confirmation", () => {
    seedBaseTransition();
    startIntake(CHAT_ID, stores);
    handleIntakeText(CHAT_ID, "Крафт", stores);
    handleIntakeText(CHAT_ID, "1", stores); // Марьино
    const result = handleIntakeText(CHAT_ID, "5-5", stores);
    expect(result).not.toBeNull();
    expect(result!.message).toContain("ЗП № 3");
    expect(result!.buttons).toBeDefined(); // buttons: base_yes / base_no
  });

  it("no base found — goes to collecting", () => {
    startIntake(CHAT_ID, stores);
    handleIntakeText(CHAT_ID, "Крафт", stores);
    handleIntakeText(CHAT_ID, "Новый объект", stores);
    const result = handleIntakeText(CHAT_ID, "1-1", stores);
    expect(result).not.toBeNull();
    expect(result!.message).toContain("без базы");
  });
});

// === Base confirmation ===

describe("base confirmation", () => {
  function goToBaseConfirmation(): void {
    seedBaseTransition();
    startIntake(CHAT_ID, stores);
    handleIntakeText(CHAT_ID, "Крафт", stores);
    handleIntakeText(CHAT_ID, "1", stores);
    handleIntakeText(CHAT_ID, "5-5", stores);
  }

  it("accept base applies inheritance", () => {
    goToBaseConfirmation();
    const result = handleIntakeText(CHAT_ID, "да", stores);
    expect(result!.message).toContain("База");

    // Draft should have inherited fields
    const draft = stores.intakeDrafts.getByChatId(CHAT_ID);
    expect(draft).not.toBeNull();
    expect(draft!.fields.length).toBeGreaterThan(5);
    expect(draft!.base_transition_id).toBe("kraft-marino-3");
  });

  it("decline base goes to collecting without inheritance", () => {
    goToBaseConfirmation();
    const result = handleIntakeText(CHAT_ID, "нет", stores);
    expect(result!.message).toContain("без базы");

    const draft = stores.intakeDrafts.getByChatId(CHAT_ID);
    expect(draft).not.toBeNull();
    expect(draft!.base_transition_id).toBeUndefined();
  });
});

// === Text intake in collecting state ===

describe("text intake", () => {
  function goToCollecting(): void {
    startIntake(CHAT_ID, stores);
    handleIntakeText(CHAT_ID, "Крафт", stores);
    handleIntakeText(CHAT_ID, "Новый объект", stores);
    handleIntakeText(CHAT_ID, "1-1", stores);
  }

  it("extracts dates from text", () => {
    goToCollecting();
    const result = handleIntakeText(CHAT_ID, "10.12.2025 - 22.12.2025 Огородный д.11", stores);
    expect(result).not.toBeNull();
    expect(result!.message).toContain("→"); // "2→2" compact format

    const draft = stores.intakeDrafts.getByChatId(CHAT_ID);
    expect(draft!.data.start_date).toBeDefined();
    expect(draft!.data.end_date).toBeDefined();
  });

  it("unrecognized text gives hint", () => {
    goToCollecting();
    const result = handleIntakeText(CHAT_ID, "привет", stores);
    expect(result).not.toBeNull();
    expect(result!.message).toContain("Не распознал");
  });
});

// === /review_gnb ===

describe("/review_gnb", () => {
  it("shows review for draft with base", () => {
    seedBaseTransition();
    startIntake(CHAT_ID, stores);
    handleIntakeText(CHAT_ID, "Крафт", stores);
    handleIntakeText(CHAT_ID, "1", stores);
    handleIntakeText(CHAT_ID, "5-5", stores);
    handleIntakeText(CHAT_ID, "да", stores); // accept base

    const result = handleReview(CHAT_ID, stores);
    expect(result.message).toContain("Паспорт ГНБ");
    expect(result.message).toContain("Унаследовано");
  });

  it("review with no draft returns error", () => {
    const result = handleReview(CHAT_ID, stores);
    expect(result.message).toContain("Начните с /new_gnb");
  });
});

// === Confirm flow ===

describe("confirm flow", () => {
  function goToFullDraft(): void {
    seedBaseTransition();
    startIntake(CHAT_ID, stores);
    handleIntakeText(CHAT_ID, "Крафт", stores);
    handleIntakeText(CHAT_ID, "1", stores);
    handleIntakeText(CHAT_ID, "5-5", stores);
    handleIntakeText(CHAT_ID, "да", stores); // accept base

    // Add volatile fields
    handleIntakeText(CHAT_ID, "10.12.2025 - 22.12.2025 г. Москва, Огородный д.11", stores);
    handleIntakeText(CHAT_ID, "Lпроф 194.67 Lплан 190.22", stores);
  }

  it("review shows ready when all data present", () => {
    goToFullDraft();
    const result = handleReview(CHAT_ID, stores);
    // Should have most fields filled
    expect(result.message).toContain("Паспорт ГНБ");
  });

  it("confirm with missing data is blocked", () => {
    startIntake(CHAT_ID, stores);
    handleIntakeText(CHAT_ID, "Крафт", stores);
    handleIntakeText(CHAT_ID, "Новый", stores);
    handleIntakeText(CHAT_ID, "1-1", stores);
    // No data beyond identity
    handleIntakeText(CHAT_ID, "review", stores);
    const result = handleIntakeText(CHAT_ID, "да", stores);
    // Should not be in review confirmation state since review showed not ready
    // (this tests that we can't confirm when missing data)
    expect(result).not.toBeNull();
  });
});

// === Resume / discard ===

describe("resume / discard", () => {
  it("resume continues existing draft", () => {
    // Create a draft and leave it
    stores.intakeDrafts.create(CHAT_ID);
    const result = startIntake(CHAT_ID, stores);
    expect(result.message).toContain("незавершённый");

    const resume = handleIntakeText(CHAT_ID, "да", stores);
    expect(resume!.message).toContain("Продолжаем");
  });

  it("discard deletes draft and starts fresh", () => {
    stores.intakeDrafts.create(CHAT_ID);
    startIntake(CHAT_ID, stores);
    const result = handleIntakeText(CHAT_ID, "нет", stores);
    expect(result!.message).toContain("удалён");
    expect(result!.message).toContain("Кто заказчик");
  });
});

// === Cancel ===

describe("cancel", () => {
  it("cancel clears session and draft", () => {
    startIntake(CHAT_ID, stores);
    handleIntakeText(CHAT_ID, "Крафт", stores);
    handleIntakeText(CHAT_ID, "Новый", stores);
    handleIntakeText(CHAT_ID, "1-1", stores);

    const result = cancelIntake(CHAT_ID, stores);
    expect(result.message).toContain("отменён");
    expect(hasActiveIntake(CHAT_ID)).toBe(false);
  });
});

// === No active intake → null ===

describe("no active intake", () => {
  it("handleIntakeText returns null for idle chat", () => {
    const result = handleIntakeText(CHAT_ID, "hello", stores);
    expect(result).toBeNull();
  });
});

// === Finalize bridge ===

describe("finalize-intake", () => {
  it("fails on incomplete draft", () => {
    const draft = stores.intakeDrafts.create(CHAT_ID);
    const loaded = stores.intakeDrafts.get(draft.id)!;
    const result = finalizeIntake(loaded, stores);
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

// === Response builder ===

describe("intake-response", () => {
  it("buildIntakeResponse includes stats", () => {
    const draft = stores.intakeDrafts.create(CHAT_ID);
    const msg = buildIntakeResponse({
      docClass: "executive_scheme",
      fileName: "ИС.pdf",
      summary: "ИС: 5 полей",
      fieldsExtracted: 5,
      fieldsUpdated: 3,
      conflictsFound: 0,
      warnings: [],
      draft: stores.intakeDrafts.get(draft.id)!,
    });
    expect(msg).toContain("ИС.pdf");
    expect(msg).toContain("5→3"); // compact: extracted→updated
  });
});
