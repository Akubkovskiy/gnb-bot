/**
 * Tests for text extractor — extracts structured fields from free text.
 */

import { describe, it, expect } from "vitest";
import { extractFromText } from "../../src/intake/text-extractor.js";

const SRC = "manual-1";

describe("extractFromText", () => {
  // === GNB number ===

  it("extracts ЗП № 5-5", () => {
    const r = extractFromText("ЗП № 5-5", SRC);
    const gnb = r.fields.find((f) => f.field_name === "gnb_number");
    expect(gnb?.value).toBe("ЗП № 5-5");
    const short = r.fields.find((f) => f.field_name === "gnb_number_short");
    expect(short?.value).toBe("5-5");
  });

  it("extracts ЗП 6-6 without №", () => {
    const r = extractFromText("ЗП 6-6", SRC);
    expect(r.fields.find((f) => f.field_name === "gnb_number")?.value).toBe("ЗП № 6-6");
  });

  it("does not extract bare number without dash or ЗП prefix", () => {
    const r = extractFromText("длина 194", SRC);
    expect(r.fields.find((f) => f.field_name === "gnb_number")).toBeUndefined();
  });

  // === Dates ===

  it("extracts two dates", () => {
    const r = extractFromText("10.12.2025 - 22.12.2025", SRC);
    const start = r.fields.find((f) => f.field_name === "start_date");
    const end = r.fields.find((f) => f.field_name === "end_date");
    expect(start?.value).toEqual({ day: 10, month: "декабря", year: 2025 });
    expect(end?.value).toEqual({ day: 22, month: "декабря", year: 2025 });
    expect(start?.confidence).toBe("high");
  });

  it("single date → medium confidence start_date", () => {
    const r = extractFromText("10.12.2025", SRC);
    const start = r.fields.find((f) => f.field_name === "start_date");
    expect(start?.confidence).toBe("medium");
    expect(start?.notes).toContain("нужна вторая");
  });

  // === Lengths ===

  it("extracts Lпроф and Lплан", () => {
    const r = extractFromText("Lпроф 194.67 Lплан 61.7", SRC);
    expect(r.fields.find((f) => f.field_name === "gnb_params.profile_length")?.value).toBe(194.67);
    expect(r.fields.find((f) => f.field_name === "gnb_params.plan_length")?.value).toBe(61.7);
  });

  it("extracts проф/план with different separators", () => {
    const r = extractFromText("проф=194,67 план: 61.7", SRC);
    expect(r.fields.find((f) => f.field_name === "gnb_params.profile_length")?.value).toBe(194.67);
    expect(r.fields.find((f) => f.field_name === "gnb_params.plan_length")?.value).toBe(61.7);
  });

  // === Pipe count ===

  it("extracts pipe count", () => {
    const r = extractFromText("2 трубы", SRC);
    expect(r.fields.find((f) => f.field_name === "gnb_params.pipe_count")?.value).toBe(2);
  });

  // === Drill diameter ===

  it("extracts drill diameter", () => {
    const r = extractFromText("d скважины = 350", SRC);
    expect(r.fields.find((f) => f.field_name === "gnb_params.drill_diameter")?.value).toBe(350);
  });

  // === Pipe mark ===

  it("extracts pipe mark ЭЛЕКТРОПАЙП", () => {
    const r = extractFromText("Труба ЭЛЕКТРОПАЙП 225/170", SRC);
    const pipe = r.fields.find((f) => f.field_name === "pipe");
    expect(pipe).toBeDefined();
    expect((pipe?.value as any).mark).toContain("ЭЛЕКТРОПАЙП");
  });

  // === Address ===

  it("extracts address with г. Москва", () => {
    const r = extractFromText("г. Москва, Огородный проезд, д. 11", SRC);
    const addr = r.fields.find((f) => f.field_name === "address");
    expect(addr?.value).toContain("Москва");
    expect(addr?.value).toContain("Огородный");
  });

  it("extracts address with 'адрес:' prefix", () => {
    const r = extractFromText("адрес: Огородный д.11", SRC);
    const addr = r.fields.find((f) => f.field_name === "address");
    expect(addr).toBeDefined();
    expect((addr?.value as string)).toContain("Москва"); // auto-prepend
  });

  // === Project number ===

  it("extracts project number", () => {
    const r = extractFromText("шифр ШФ-123", SRC);
    expect(r.fields.find((f) => f.field_name === "project_number")?.value).toBe("ШФ-123");
  });

  // === Customer ===

  it("extracts customer", () => {
    const r = extractFromText("заказчик: Крафт", SRC);
    expect(r.fields.find((f) => f.field_name === "customer")?.value).toBe("Крафт");
  });

  // === Executor ===

  it("extracts executor organization", () => {
    const r = extractFromText('исполнитель: ООО «СПЕЦИНЖСТРОЙ»', SRC);
    expect(r.fields.find((f) => f.field_name === "executor")?.value).toBe('ООО «СПЕЦИНЖСТРОЙ»');
  });

  // === Title line ===

  it("extracts title line from 'объект: ...'", () => {
    const r = extractFromText("объект: «Выполнение работ по прокладке КЛ методом ГНБ по объекту РП 70046».", SRC);
    const title = r.fields.find((f) => f.field_name === "title_line");
    expect(title).toBeDefined();
    expect((title?.value as string)).toContain("прокладке КЛ");
  });

  // === Combined message ===

  it("extracts multiple fields from one message", () => {
    const text = "ЗП 5-5 заказчик: Крафт 10.12.2025 - 22.12.2025 Lпроф 194.67 Lплан 190.22 шифр ШФ-123";
    const r = extractFromText(text, SRC);

    expect(r.fields.find((f) => f.field_name === "gnb_number")?.value).toBe("ЗП № 5-5");
    expect(r.fields.find((f) => f.field_name === "customer")?.value).toBe("Крафт");
    expect(r.fields.find((f) => f.field_name === "start_date")).toBeDefined();
    expect(r.fields.find((f) => f.field_name === "end_date")).toBeDefined();
    expect(r.fields.find((f) => f.field_name === "gnb_params.profile_length")?.value).toBe(194.67);
    expect(r.fields.find((f) => f.field_name === "gnb_params.plan_length")?.value).toBe(190.22);
    expect(r.fields.find((f) => f.field_name === "project_number")?.value).toBe("ШФ-123");
  });

  // === Empty / no match ===

  it("empty text returns no fields", () => {
    const r = extractFromText("", SRC);
    expect(r.fields).toHaveLength(0);
  });

  it("unrecognized text → unmatched", () => {
    const r = extractFromText("привет как дела", SRC);
    expect(r.fields).toHaveLength(0);
    expect(r.unmatched).toContain("привет");
  });

  // === Signatories ===

  it("extracts signatory without duplicating surname as position (Bug 1)", () => {
    const r = extractFromText("технадзор - гайдуков", SRC);
    const tech = r.fields.find((f) => f.field_name === "signatories.tech_supervisor");
    expect(tech).toBeDefined();
    const val = tech!.value as { full_name: string; position: string };
    // full_name should be capitalized, position should NOT duplicate the name
    expect(val.full_name).toBe("Гайдуков");
    expect(val.position).toBe("—"); // placeholder, not "гайдуков"
  });

  it("extracts signatory with FIO and position correctly", () => {
    const r = extractFromText("мастер - инженер ЦРЭС АО ОЭК Селиванов В.Ю.", SRC);
    const sign1 = r.fields.find((f) => f.field_name === "signatories.sign1_customer");
    expect(sign1).toBeDefined();
    const val = sign1!.value as { full_name: string; position: string };
    expect(val.full_name).toBe("Селиванов В.Ю.");
    // position should not contain the FIO
    expect(val.position).not.toContain("Селиванов");
  });

  // === All fields have correct source metadata ===

  it("all fields have source_type manual_text", () => {
    const r = extractFromText("ЗП 5-5 10.12.2025 - 22.12.2025 Lпроф 194", SRC);
    for (const f of r.fields) {
      expect(f.source_type).toBe("manual_text");
      expect(f.source_id).toBe(SRC);
      expect(f.confirmed_by_owner).toBe(false);
      expect(f.conflict_with_existing).toBe(false);
    }
  });
});
