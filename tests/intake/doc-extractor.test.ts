/**
 * Tests for document extraction pipeline.
 *
 * Uses mocked Claude responses — no real Claude CLI calls.
 * Tests: normalization, field mapping, material detection, prompt building,
 * full pipeline with mock, edge cases.
 */

import { describe, it, expect } from "vitest";
import {
  normalizeExtraction,
  mapExtractionToFields,
  buildExtractionPrompt,
  parseKeyValuePairs,
  detectMaterialSubtype,
  detectMaterialSubtypeFromText,
  extractDocument,
} from "../../src/intake/doc-extractor.js";
import type { ExtractionResult } from "../../src/intake/extraction-types.js";

// === Mock Claude responses ===

const MOCK_EXECUTIVE_SCHEME = `НОМЕР_ГНБ: ЗП № 5-5
ОБЪЕКТ: Марьино
ЗАГОЛОВОК: Выполнение работ по прокладке КЛ методом ГНБ по объекту РП 70046
АДРЕС: г. Москва, Огородный проезд, д. 11
ШИФР_ПРОЕКТА: ШФ-123
L_ПЛАН: 190.22
L_ПРОФИЛЬ: 194.67
ДИАМЕТР_ТРУБЫ: 225
КОЛ_ТРУБ: 2
ДИАМЕТР_СКВАЖИНЫ: 350
КОНФИГУРАЦИЯ: прямая
ЗАКАЗЧИК: АО «ОЭК»`;

const MOCK_PASSPORT_PIPE = `НОМЕР_ДОКУМЕНТА: №13043
ДАТА_ДОКУМЕНТА: 08.09.2025
МАРКА_ТРУБЫ: Труба ЭЛЕКТРОПАЙП 225/170-N 1250 F2 SDR 13,6
ДИАМЕТР: 225
ПАРТИЯ: 2025-09-001
ПРОИЗВОДИТЕЛЬ: ООО «ЭЛЕКТРОПАЙП»`;

const MOCK_CERTIFICATE = `НОМЕР_ДОКУМЕНТА: РОСС RU.H00180-24
ДАТА_ДОКУМЕНТА: 15.01.2024
СРОК_ДЕЙСТВИЯ: 15.01.2029
ПРОДУКЦИЯ: Трубы полиэтиленовые ПЭ100
ОРГАН: Орган по сертификации`;

const MOCK_ORDER = `ФИО: Гайдуков Н.И.
ДОЛЖНОСТЬ: Главный специалист ОТН
ОРГАНИЗАЦИЯ: АО «ОЭК»
ТИП_ДОКУМЕНТА: распоряжение
НОМЕР_ДОКУМЕНТА: 01/3349-р
ДАТА_ДОКУМЕНТА: 14.10.2024
НРС_НОМЕР: C-71-259039
НРС_ДАТА: 23.09.2022
РОЛЬ: технадзор`;

const MOCK_BENTONITE = `НОМЕР_ДОКУМЕНТА: ПК-2024-456
ДАТА_ДОКУМЕНТА: 12.03.2025
НАЗВАНИЕ_МАТЕРИАЛА: Бентонит буровой БМ-1
ТИП_ДОКУМЕНТА: паспорт
ПРОИЗВОДИТЕЛЬ: ООО «Бентопром»
ПАРТИЯ: 2025-03
ПРИМЕЧАНИЕ: для ГНБ работ`;

const MOCK_UKPT = `НОМЕР_ДОКУМЕНТА: С-789
ДАТА_ДОКУМЕНТА: 01.02.2025
НАЗВАНИЕ_МАТЕРИАЛА: УКПТ-225
ТИП_ДОКУМЕНТА: сертификат
ПРОИЗВОДИТЕЛЬ: не найдено`;

const MOCK_WITH_QUESTION_MARKS = `НОМЕР_ГНБ: ЗП № 5-5
АДРЕС: г. Москва, Огородный проезд (?)
L_ПРОФИЛЬ: 194.67
ШИФР_ПРОЕКТА: не найдено`;

const MOCK_PRIOR_ACT = `НОМЕР_ГНБ: ЗП № 3
ОБЪЕКТ: Марьино
АДРЕС: г. Москва, Огородный проезд, д. 11
ЗАКАЗЧИК: Крафт
ШИФР_ПРОЕКТА: ШФ-123
ПОДПИСАНТ_1: Акимов Ю.О., Мастер по ЭРС СВРЭС, АО «ОЭК»
ПОДПИСАНТ_2: Буряк А.М., Начальник участка, АНО «ОЭК Стройтрест»
ПОДПИСАНТ_ТН: Гайдуков Н.И., Главный специалист ОТН, АО «ОЭК»
МАРКА_ТРУБЫ: Труба ЭЛЕКТРОПАЙП 225/170
L_ПЛАН: 61.7
L_ПРОФИЛЬ: 63.3`;

// === parseKeyValuePairs ===

describe("parseKeyValuePairs", () => {
  it("parses KEY: value pairs", () => {
    const pairs = parseKeyValuePairs("НОМЕР_ГНБ: ЗП № 5-5\nАДРЕС: Москва");
    expect(pairs).toHaveLength(2);
    expect(pairs[0]).toEqual({ key: "НОМЕР_ГНБ", value: "ЗП № 5-5" });
    expect(pairs[1]).toEqual({ key: "АДРЕС", value: "Москва" });
  });

  it("handles empty lines and non-matching lines", () => {
    const pairs = parseKeyValuePairs("Заголовок\n\nНОМЕР: 123\nsome text");
    expect(pairs).toHaveLength(1);
    expect(pairs[0].key).toBe("НОМЕР");
  });

  it("handles = separator", () => {
    const pairs = parseKeyValuePairs("L_ПЛАН = 190.22");
    expect(pairs).toHaveLength(1);
    expect(pairs[0].value).toBe("190.22");
  });
});

// === normalizeExtraction ===

describe("normalizeExtraction", () => {
  it("normalizes executive scheme response", () => {
    const r = normalizeExtraction(MOCK_EXECUTIVE_SCHEME, "executive_scheme", "pdf");
    expect(r.doc_class).toBe("executive_scheme");
    expect(r.fields.length).toBeGreaterThanOrEqual(10);
    expect(r.fields.find((f) => f.key === "НОМЕР_ГНБ")?.value).toBe("ЗП № 5-5");
    expect(r.fields.find((f) => f.key === "L_ПРОФИЛЬ")?.value).toBe(194.67);
    expect(r.fields.find((f) => f.key === "L_ПЛАН")?.value).toBe(190.22);
    expect(r.warnings).toHaveLength(0);
    expect(r.confidence).toBe("high");
  });

  it("normalizes passport pipe response", () => {
    const r = normalizeExtraction(MOCK_PASSPORT_PIPE, "passport_pipe", "pdf");
    expect(r.doc_class).toBe("passport_pipe");
    expect(r.doc_number).toBe("№13043");
    expect(r.doc_date).toBe("08.09.2025");
    expect(r.fields.find((f) => f.key === "МАРКА_ТРУБЫ")?.value).toContain("ЭЛЕКТРОПАЙП");
    expect(r.suggested_name_parts?.number).toBe("№13043");
  });

  it("normalizes certificate response", () => {
    const r = normalizeExtraction(MOCK_CERTIFICATE, "certificate", "pdf");
    expect(r.doc_number).toBe("РОСС RU.H00180-24");
    expect(r.fields.find((f) => f.key === "СРОК_ДЕЙСТВИЯ")?.value).toBe("15.01.2029");
  });

  it("normalizes order/appointment response", () => {
    const r = normalizeExtraction(MOCK_ORDER, "order", "pdf");
    expect(r.fields.find((f) => f.key === "ФИО")?.value).toBe("Гайдуков Н.И.");
    expect(r.fields.find((f) => f.key === "НРС_НОМЕР")?.value).toBe("C-71-259039");
    expect(r.doc_number).toBe("01/3349-р");
  });

  it("normalizes prior act response", () => {
    const r = normalizeExtraction(MOCK_PRIOR_ACT, "prior_internal_act", "excel");
    expect(r.fields.find((f) => f.key === "НОМЕР_ГНБ")?.value).toBe("ЗП № 3");
    expect(r.fields.find((f) => f.key === "L_ПЛАН")?.value).toBe(61.7);
    expect(r.fields.find((f) => f.key === "L_ПРОФИЛЬ")?.value).toBe(63.3);
  });

  it("handles (?) markers as medium confidence", () => {
    const r = normalizeExtraction(MOCK_WITH_QUESTION_MARKS, "executive_scheme", "pdf");
    const addr = r.fields.find((f) => f.key === "АДРЕС");
    expect(addr?.confidence).toBe("medium");
    expect(addr?.value).toBe("г. Москва, Огородный проезд");
    expect(addr?.notes).toContain("нечёткое");
  });

  it("'не найдено' produces warning, not field", () => {
    const r = normalizeExtraction(MOCK_WITH_QUESTION_MARKS, "executive_scheme", "pdf");
    expect(r.warnings).toContain("ШИФР_ПРОЕКТА: не найдено");
    expect(r.fields.find((f) => f.key === "ШИФР_ПРОЕКТА")).toBeUndefined();
  });

  it("missing doc_number for passport → warning", () => {
    const r = normalizeExtraction("МАРКА_ТРУБЫ: ПЭ 100", "passport_pipe", "pdf");
    expect(r.warnings).toContain("Номер паспорта не найден");
  });

  it("missing doc_date for order → warning", () => {
    const r = normalizeExtraction("ФИО: Иванов\nНОМЕР_ДОКУМЕНТА: 123", "order", "pdf");
    expect(r.warnings).toContain("Дата документа не найдена");
  });

  it("empty response → low confidence, no fields", () => {
    const r = normalizeExtraction("", "unknown", "pdf");
    expect(r.fields).toHaveLength(0);
    expect(r.confidence).toBe("low");
  });
});

// === Material support ===

describe("material detection", () => {
  it("detects bentonite from filename", () => {
    expect(detectMaterialSubtype("Паспорт бентонит БМ-1.pdf")).toBe("bentonite");
  });

  it("detects УКПТ from filename", () => {
    expect(detectMaterialSubtype("УКПТ-225 сертификат.pdf")).toBe("ukpt");
  });

  it("detects plugs from filename", () => {
    expect(detectMaterialSubtype("Заглушки ПЭ225.pdf")).toBe("plugs");
  });

  it("detects cord from filename", () => {
    expect(detectMaterialSubtype("Шнур герметизирующий.pdf")).toBe("cord");
  });

  it("returns undefined for non-material file", () => {
    expect(detectMaterialSubtype("Паспорт качества №13043.pdf")).toBeUndefined();
  });

  it("detects material from text content", () => {
    expect(detectMaterialSubtypeFromText("Бентонит буровой марки БМ-1")).toBe("bentonite");
    expect(detectMaterialSubtypeFromText("УКПТ уплотнительная")).toBe("ukpt");
  });

  it("normalizes bentonite material doc", () => {
    const r = normalizeExtraction(MOCK_BENTONITE, "unknown", "pdf", "bentonite");
    expect(r.material_subtype).toBe("bentonite");
    expect(r.doc_number).toBe("ПК-2024-456");
    expect(r.fields.find((f) => f.key === "НАЗВАНИЕ_МАТЕРИАЛА")?.value).toContain("Бентонит");
    expect(r.summary).toContain("бентонит");
  });

  it("normalizes УКПТ material doc", () => {
    const r = normalizeExtraction(MOCK_UKPT, "unknown", "pdf", "ukpt");
    expect(r.material_subtype).toBe("ukpt");
    expect(r.doc_number).toBe("С-789");
    expect(r.warnings).toContain("ПРОИЗВОДИТЕЛЬ: не найдено");
  });
});

// === Field mapping ===

describe("mapExtractionToFields", () => {
  it("maps executive scheme fields to draft fields", () => {
    const extraction = normalizeExtraction(MOCK_EXECUTIVE_SCHEME, "executive_scheme", "pdf");
    const fields = mapExtractionToFields(extraction, "src-1");

    expect(fields.length).toBeGreaterThanOrEqual(8);

    const gnb = fields.find((f) => f.field_name === "gnb_number");
    expect(gnb?.value).toBe("ЗП № 5-5");
    expect(gnb?.source_id).toBe("src-1");
    expect(gnb?.source_type).toBe("pdf");

    const profile = fields.find((f) => f.field_name === "gnb_params.profile_length");
    expect(profile?.value).toBe(194.67);

    const plan = fields.find((f) => f.field_name === "gnb_params.plan_length");
    expect(plan?.value).toBe(190.22);

    expect(fields.find((f) => f.field_name === "address")?.value).toContain("Огородный");
    expect(fields.find((f) => f.field_name === "project_number")?.value).toBe("ШФ-123");
    expect(fields.find((f) => f.field_name === "customer")?.value).toContain("ОЭК");
  });

  it("maps passport pipe to pipe field", () => {
    const extraction = normalizeExtraction(MOCK_PASSPORT_PIPE, "passport_pipe", "pdf");
    const fields = mapExtractionToFields(extraction, "src-2");

    const pipe = fields.find((f) => f.field_name === "pipe");
    expect(pipe).toBeDefined();
    expect((pipe?.value as any).mark).toContain("ЭЛЕКТРОПАЙП");
  });

  it("maps prior act fields", () => {
    const extraction = normalizeExtraction(MOCK_PRIOR_ACT, "prior_internal_act", "excel");
    const fields = mapExtractionToFields(extraction, "src-3");

    expect(fields.find((f) => f.field_name === "gnb_number")?.value).toBe("ЗП № 3");
    expect(fields.find((f) => f.field_name === "customer")?.value).toBe("Крафт");
    expect(fields.find((f) => f.field_name === "gnb_params.plan_length")?.value).toBe(61.7);
  });

  it("preserves confidence from extraction", () => {
    const extraction = normalizeExtraction(MOCK_WITH_QUESTION_MARKS, "executive_scheme", "pdf");
    const fields = mapExtractionToFields(extraction, "src-4");

    const addr = fields.find((f) => f.field_name === "address");
    expect(addr?.confidence).toBe("medium");
  });

  it("order fields are not auto-mapped (role-dependent)", () => {
    const extraction = normalizeExtraction(MOCK_ORDER, "order", "pdf");
    const fields = mapExtractionToFields(extraction, "src-5");
    // Order fields need manual role resolution — no auto-mapping
    expect(fields).toHaveLength(0);
  });

  it("unknown doc_class produces no mapped fields", () => {
    const extraction = normalizeExtraction("ТИП_ДОКУМЕНТА: неизвестно", "unknown", "pdf");
    const fields = mapExtractionToFields(extraction, "src-6");
    expect(fields).toHaveLength(0);
  });
});

// === Prompt building ===

describe("buildExtractionPrompt", () => {
  it("executive_scheme prompt asks for geometry", () => {
    const prompt = buildExtractionPrompt("executive_scheme", "/tmp/test.pdf");
    expect(prompt).toContain("L_ПЛАН");
    expect(prompt).toContain("L_ПРОФИЛЬ");
    expect(prompt).toContain("ДИАМЕТР_СКВАЖИНЫ");
    expect(prompt).toContain("НЕ додумывай");
  });

  it("passport_pipe prompt asks for pipe info", () => {
    const prompt = buildExtractionPrompt("passport_pipe", "/tmp/test.pdf");
    expect(prompt).toContain("МАРКА_ТРУБЫ");
    expect(prompt).toContain("НОМЕР_ДОКУМЕНТА");
  });

  it("order prompt asks for signatory data", () => {
    const prompt = buildExtractionPrompt("order", "/tmp/test.pdf");
    expect(prompt).toContain("ФИО");
    expect(prompt).toContain("НРС_НОМЕР");
    expect(prompt).toContain("РОЛЬ");
  });

  it("material prompt uses subtype label", () => {
    const prompt = buildExtractionPrompt("unknown", "/tmp/test.pdf", "bentonite");
    expect(prompt).toContain("бентонит");
    expect(prompt).toContain("НАЗВАНИЕ_МАТЕРИАЛА");
  });

  it("all prompts contain truthfulness rule", () => {
    for (const dc of ["executive_scheme", "passport_pipe", "certificate", "order"] as const) {
      const prompt = buildExtractionPrompt(dc, "/tmp/test.pdf");
      expect(prompt).toContain("НЕ додумывай");
    }
  });
});

// === Full pipeline with mock ===

describe("extractDocument (full pipeline with mock)", () => {
  it("extracts executive scheme", async () => {
    const mockClaude = async () => MOCK_EXECUTIVE_SCHEME;
    const result = await extractDocument("/tmp/test-scheme.pdf", mockClaude);

    expect(result.doc_class).toBe("unknown"); // filename doesn't match scheme
    // But text content should refine it
    expect(result.fields.length).toBeGreaterThan(0);
    expect(result.confidence).not.toBe("low");
  });

  it("extracts from classified filename", async () => {
    const mockClaude = async () => MOCK_PASSPORT_PIPE;
    const result = await extractDocument("/tmp/Паспорт качества №13043.pdf", mockClaude);

    expect(result.doc_class).toBe("passport_pipe");
    expect(result.doc_number).toBe("№13043");
  });

  it("handles Claude error gracefully", async () => {
    const mockClaude = async () => { throw new Error("connection failed"); };
    const result = await extractDocument("/tmp/test.pdf", mockClaude);

    expect(result.confidence).toBe("low");
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("connection failed");
  });

  it("detects material from filename", async () => {
    const mockClaude = async () => MOCK_BENTONITE;
    const result = await extractDocument("/tmp/Бентонит паспорт.pdf", mockClaude);

    expect(result.material_subtype).toBe("bentonite");
  });
});
