import { describe, it, expect } from "vitest";
import { validateTransition, getBlockers, getWarnings, getConfirms } from "../../src/domain/validators.js";
import type { Transition } from "../../src/domain/types.js";

// Minimal valid transition (all required fields present)
function makeValidTransition(): Partial<Transition> {
  return {
    gnb_number: "ЗП № 5-5",
    customer: "Крафт",
    object: "Марьино",
    address: "г. Москва, Огородный проезд, д. 11, стр. 5",
    start_date: { day: 10, month: "декабря", year: 2025 },
    end_date: { day: 22, month: "декабря", year: 2025 },
    signatories: {
      sign1_customer: {
        person_id: "korobkov-yun",
        role: "sign1",
        org_description: "Представитель АО «ОЭК»",
        position: "Мастер по ЭРС СВРЭС",
        full_name: "Коробков Ю.Н.",
        aosr_full_line: "",
      },
      sign2_contractor: {
        person_id: "buryak-am",
        role: "sign2",
        org_description: "Подрядчик",
        position: "Начальник участка",
        full_name: "Буряк А.М.",
        aosr_full_line: "",
      },
      sign3_optional: {
        person_id: "shcheglov-ra",
        role: "sign3",
        org_description: "Субподрядчик",
        position: "Начальник участка",
        full_name: "Щеглов Р.А.",
        aosr_full_line: "",
      },
      tech_supervisor: {
        person_id: "gaydukov-ni",
        role: "tech",
        org_description: "Технадзор",
        position: "Главный специалист ОТН",
        full_name: "Гайдуков Н.И.",
        aosr_full_line: "",
      },
    },
    organizations: {
      customer: { id: "oek", name: "АО «ОЭК»", ogrn: "", inn: "", legal_address: "", phone: "", sro_name: "" },
      contractor: { id: "oek-st", name: "АНО «ОЭК Стройтрест»", ogrn: "", inn: "", legal_address: "", phone: "", sro_name: "" },
      designer: { id: "sis", name: "ООО «СПЕЦИНЖСТРОЙ»", ogrn: "", inn: "", legal_address: "", phone: "", sro_name: "" },
    },
    gnb_params: { profile_length: 194.67, pipe_count: 2 },
    pipe: { mark: "Труба ЭЛЕКТРОПАЙП 225", diameter: "d=225", diameter_mm: 225 },
    project_number: "04-ОЭКСТ-КС-25-ТКР.1",
  };
}

describe("validateTransition", () => {
  it("passes with all required fields", () => {
    const report = validateTransition(makeValidTransition());
    expect(report.valid).toBe(true);
    expect(getBlockers(report)).toHaveLength(0);
  });

  it("blocks on missing gnb_number", () => {
    const t = makeValidTransition();
    t.gnb_number = "";
    const report = validateTransition(t);
    expect(report.valid).toBe(false);
    expect(getBlockers(report).some(b => b.field === "gnb_number")).toBe(true);
  });

  it("blocks on missing customer", () => {
    const t = makeValidTransition();
    t.customer = "";
    expect(validateTransition(t).valid).toBe(false);
  });

  it("blocks on missing object", () => {
    const t = makeValidTransition();
    t.object = undefined;
    expect(validateTransition(t).valid).toBe(false);
  });

  it("blocks on missing address", () => {
    const t = makeValidTransition();
    t.address = "";
    expect(validateTransition(t).valid).toBe(false);
  });

  it("blocks on missing start_date", () => {
    const t = makeValidTransition();
    t.start_date = undefined;
    expect(validateTransition(t).valid).toBe(false);
  });

  it("blocks on missing end_date", () => {
    const t = makeValidTransition();
    t.end_date = undefined;
    expect(validateTransition(t).valid).toBe(false);
  });

  it("blocks on missing sign1", () => {
    const t = makeValidTransition();
    t.signatories!.sign1_customer = undefined as any;
    const report = validateTransition(t);
    expect(report.valid).toBe(false);
    expect(getBlockers(report).some(b => b.field === "sign1")).toBe(true);
  });

  it("blocks on missing sign2", () => {
    const t = makeValidTransition();
    t.signatories!.sign2_contractor = undefined as any;
    expect(validateTransition(t).valid).toBe(false);
  });

  it("blocks on missing tech", () => {
    const t = makeValidTransition();
    t.signatories!.tech_supervisor = undefined as any;
    expect(validateTransition(t).valid).toBe(false);
  });

  it("blocks on missing profile_length", () => {
    const t = makeValidTransition();
    t.gnb_params = { profile_length: 0, pipe_count: 2 };
    expect(validateTransition(t).valid).toBe(false);
  });

  it("warns on missing pipe_mark", () => {
    const t = makeValidTransition();
    t.pipe = undefined;
    const report = validateTransition(t);
    expect(report.valid).toBe(true); // WARN doesn't block
    expect(getWarnings(report).some(w => w.field === "pipe_mark")).toBe(true);
  });

  it("warns on missing project_number", () => {
    const t = makeValidTransition();
    t.project_number = "";
    const report = validateTransition(t);
    expect(report.valid).toBe(true);
    expect(getWarnings(report).some(w => w.field === "project_number")).toBe(true);
  });

  it("confirms when sign3 is absent", () => {
    const t = makeValidTransition();
    t.signatories!.sign3_optional = undefined;
    const report = validateTransition(t);
    expect(report.valid).toBe(true); // CONFIRM doesn't block
    expect(getConfirms(report).some(c => c.field === "sign3")).toBe(true);
  });

  it("no confirm for sign3 when present", () => {
    const report = validateTransition(makeValidTransition());
    expect(getConfirms(report)).toHaveLength(0);
  });

  it("reports multiple blockers at once", () => {
    const report = validateTransition({}); // empty transition
    expect(report.valid).toBe(false);
    expect(getBlockers(report).length).toBeGreaterThanOrEqual(8);
  });
});

describe("helper functions", () => {
  it("getBlockers filters correctly", () => {
    const report = validateTransition({});
    const blockers = getBlockers(report);
    expect(blockers.every(b => b.level === "BLOCK")).toBe(true);
  });

  it("getWarnings filters correctly", () => {
    const report = validateTransition({});
    const warnings = getWarnings(report);
    expect(warnings.every(w => w.level === "WARN")).toBe(true);
  });
});
