import { describe, it, expect } from "vitest";
import {
  formatDateInternal,
  monthGenitive,
  parseDate,
  formatSignatoryDesc,
  formatSignatorySign,
  formatOrgAosr,
  formatMaterialsAosr,
  formatProjectDocAosr,
  parseGnbNumber,
} from "../../src/domain/formatters.js";
import type { Signatory, Organization, Pipe, Materials } from "../../src/domain/types.js";

// === Date tests ===

describe("formatDateInternal", () => {
  it("formats standard date", () => {
    expect(formatDateInternal({ day: 6, month: "октября", year: 2025 }))
      .toBe("«6» октября 2025 г.");
  });

  it("formats single-digit day", () => {
    expect(formatDateInternal({ day: 1, month: "января", year: 2026 }))
      .toBe("«1» января 2026 г.");
  });
});

describe("monthGenitive", () => {
  it("returns genitive for all 12 months", () => {
    expect(monthGenitive(1)).toBe("января");
    expect(monthGenitive(6)).toBe("июня");
    expect(monthGenitive(12)).toBe("декабря");
  });

  it("throws on invalid month", () => {
    expect(() => monthGenitive(0)).toThrow();
    expect(() => monthGenitive(13)).toThrow();
  });
});

describe("parseDate", () => {
  it("parses DD.MM.YYYY", () => {
    expect(parseDate("10.12.2025")).toEqual({ day: 10, month: "декабря", year: 2025 });
  });

  it("parses DD/MM/YYYY", () => {
    expect(parseDate("10/12/2025")).toEqual({ day: 10, month: "декабря", year: 2025 });
  });

  it("parses YYYY-MM-DD (ISO)", () => {
    expect(parseDate("2025-12-10")).toEqual({ day: 10, month: "декабря", year: 2025 });
  });

  it("parses '10 декабря 2025'", () => {
    expect(parseDate("10 декабря 2025")).toEqual({ day: 10, month: "декабря", year: 2025 });
  });

  it("parses '10 декабря 2025 г.'", () => {
    expect(parseDate("10 декабря 2025 г.")).toEqual({ day: 10, month: "декабря", year: 2025 });
  });

  it("throws on unparseable input", () => {
    expect(() => parseDate("вчера")).toThrow();
  });
});

// === Signatory tests ===

const mockSign1: Signatory = {
  person_id: "korobkov-yun",
  role: "sign1",
  org_description: "Представитель АО «ОЭК»",
  position: "Мастер по ЭРС СВРЭС",
  full_name: "Коробков Ю.Н.",
  aosr_full_line: "Мастер по ЭРС СВРЭС АО «ОЭК» Коробков Ю.Н.",
};

const mockTech: Signatory = {
  person_id: "gaydukov-ni",
  role: "tech",
  org_description: "Представитель технического надзора АО «ОЭК»",
  position: "Главный специалист ОТН",
  full_name: "Гайдуков Н.И.",
  nrs_id: "C-71-259039",
  nrs_date: "23.09.2022",
  order_type: "распоряжение",
  order_number: "01/3349-р",
  order_date: "14.10.2024",
  aosr_full_line: "Главный специалист ОТН АО «ОЭК» Гайдуков Н.И., идентификационный номер C-71-259039 от 23.09.2022, распоряжение №01/3349-р от 14.10.2024г.",
};

const mockSign2: Signatory = {
  person_id: "buryak-am",
  role: "sign2",
  org_description: 'Представитель подрядной организации АНО "ОЭК Стройтрест"',
  position: "Начальник участка",
  full_name: "Буряк А.М.",
  nrs_id: "С-58-228991",
  nrs_date: "05.03.2021",
  order_type: "приказ",
  order_number: "699",
  order_date: "01.10.2025",
  aosr_full_line: 'Начальник участка управления по строительству сетей электроснабжения АНО "ОЭК Стройтрест" Буряк А.М. идентификационный номер С-58-228991 от 05.03.2021г., приказ № 699 от 01.10.2025г.',
};

const mockSign3: Signatory = {
  person_id: "shcheglov-ra",
  role: "sign3",
  org_description: "Представитель субподрядной организации ООО «СПЕЦИНЖСТРОЙ»",
  position: "Начальник участка",
  full_name: "Щеглов Р.А.",
  order_type: "приказ",
  order_number: "265",
  order_date: "06.10.2025",
  aosr_full_line: 'Начальник участка ООО "СПЕЦИНЖСТРОЙ" Щеглов Р.А., приказ № 265 от 06.10.2025г.',
};

describe("formatSignatoryDesc (B-column)", () => {
  it("returns org_description for sign1", () => {
    expect(formatSignatoryDesc(mockSign1)).toBe("Представитель АО «ОЭК»");
  });

  it("returns org_description for tech", () => {
    expect(formatSignatoryDesc(mockTech)).toBe("Представитель технического надзора АО «ОЭК»");
  });

  it("returns org_description for sign2", () => {
    expect(formatSignatoryDesc(mockSign2)).toBe('Представитель подрядной организации АНО "ОЭК Стройтрест"');
  });

  it("returns org_description for sign3", () => {
    expect(formatSignatoryDesc(mockSign3)).toBe("Представитель субподрядной организации ООО «СПЕЦИНЖСТРОЙ»");
  });
});

describe("formatSignatorySign (C-column, no underscores)", () => {
  it("formats sign1: position + double-space + name", () => {
    expect(formatSignatorySign(mockSign1)).toBe("Мастер по ЭРС СВРЭС  Коробков Ю.Н.");
  });

  it("formats tech: position + double-space + name", () => {
    expect(formatSignatorySign(mockTech)).toBe("Главный специалист ОТН  Гайдуков Н.И.");
  });

  it("formats sign2: position + double-space + name", () => {
    expect(formatSignatorySign(mockSign2)).toBe("Начальник участка  Буряк А.М.");
  });

  it("formats sign3: position + double-space + name", () => {
    expect(formatSignatorySign(mockSign3)).toBe("Начальник участка  Щеглов Р.А.");
  });
});

// === Organization tests ===

const mockOekOrg: Organization = {
  id: "oek",
  name: "АО «Объединенная энергетическая компания»",
  short_name: "АО «ОЭК»",
  department: "СВРЭС",
  ogrn: "1057746394155",
  inn: "7720522853",
  legal_address: "115035, г. Москва, Раушская наб., д.8",
  phone: "8 (495) 657-91-01",
  sro_name: "Ассоциация строительных компаний «Межрегиональный строительный комплекс»",
  sro_ogrn: "1234567890123",
  sro_inn: "1234567890",
};

const mockContractorOrg: Organization = {
  id: "oek-stroytrest",
  name: "АНО «ОЭК Стройтрест»",
  ogrn: "1247700649591",
  inn: "7708442087",
  legal_address: "107078, г. Москва, ул Каланевская, д. 11, стр.2, помещ. 415",
  phone: "+7(495)228-19-79",
  sro_name: "Саморегулируемая организация",
  sro_number: "СРО-С-123-01012025",
  sro_date: "01.01.2025",
};

describe("formatOrgAosr", () => {
  it("includes department for customer role", () => {
    const result = formatOrgAosr(mockOekOrg, "customer");
    expect(result).toContain("СВРЭС АО «Объединенная энергетическая компания»");
    expect(result).toContain("ОГРН 1057746394155");
    expect(result).toContain("ИНН 7720522853");
  });

  it("omits department for contractor role", () => {
    const result = formatOrgAosr(mockContractorOrg, "contractor");
    expect(result).toMatch("АНО «ОЭК Стройтрест»");
    expect(result).toContain("ОГРН 1247700649591");
  });

  it("includes SRO number and date when present", () => {
    const result = formatOrgAosr(mockContractorOrg, "contractor");
    expect(result).toContain("СРО-С-123-01012025 от 01.01.2025");
  });

  it("includes SRO ОГРН/ИНН for customer", () => {
    const result = formatOrgAosr(mockOekOrg, "customer");
    expect(result).toContain("ОГРН 1234567890123");
    expect(result).toContain("ИНН 1234567890");
  });

  it("works for designer role (no department)", () => {
    const designerOrg: Organization = {
      ...mockContractorOrg,
      id: "specinjstroy",
      name: "ООО «СПЕЦИНЖСТРОЙ»",
    };
    const result = formatOrgAosr(designerOrg, "designer");
    expect(result).toMatch("ООО «СПЕЦИНЖСТРОЙ»");
  });
});

// === Materials tests ===

const mockPipe: Pipe = {
  mark: "Труба ЭЛЕКТРОПАЙП 225/170 - N 1250 F2 SDR 13,6",
  diameter: "d=225",
  diameter_mm: 225,
  quality_passport: "№11086 от 08.09.2025",
  conformity_cert: "№РОСС RU.12345",
};

describe("formatMaterialsAosr", () => {
  it("includes pipe mark, passport, and cert", () => {
    const result = formatMaterialsAosr(mockPipe);
    expect(result).toContain("Труба ЭЛЕКТРОПАЙП");
    expect(result).toContain("Паспорт качества №11086");
    expect(result).toContain("Сертификат соответствия №РОСС");
  });

  it("includes additional materials when present", () => {
    const materials: Materials = {
      ukpt: { passport: "№123", cert_letter: "от 01.01.2025" },
      plugs: { cert_letter: "от 02.01.2025" },
    };
    const result = formatMaterialsAosr(mockPipe, materials);
    expect(result).toContain("УКПТ: паспорт №123");
    expect(result).toContain("Заглушки: письмо от 02.01.2025");
  });

  it("handles minimal pipe (no passport, no cert)", () => {
    const minPipe: Pipe = { mark: "Труба ПЭ 110", diameter: "d=110", diameter_mm: 110 };
    const result = formatMaterialsAosr(minPipe);
    expect(result).toBe("Труба ПЭ 110");
  });
});

// === Project doc formatter ===

describe("formatProjectDocAosr", () => {
  it("uses short_name when available", () => {
    const result = formatProjectDocAosr(mockOekOrg, "04-ОЭКСТ-КС-25-ТКР.1");
    expect(result).toBe("Проектная документация АО «ОЭК», шифр 04-ОЭКСТ-КС-25-ТКР.1");
  });

  it("falls back to full name", () => {
    const org: Organization = { ...mockContractorOrg, short_name: undefined };
    const result = formatProjectDocAosr(org, "ШФ-123");
    expect(result).toBe("Проектная документация АНО «ОЭК Стройтрест», шифр ШФ-123");
  });
});

// === GNB number parsing ===

describe("parseGnbNumber", () => {
  it("parses bare number '5-5'", () => {
    expect(parseGnbNumber("5-5")).toEqual({ full: "ЗП № 5-5", short: "5-5" });
  });

  it("parses 'ЗП 5-5'", () => {
    expect(parseGnbNumber("ЗП 5-5")).toEqual({ full: "ЗП № 5-5", short: "5-5" });
  });

  it("parses 'ЗП № 5-5'", () => {
    expect(parseGnbNumber("ЗП № 5-5")).toEqual({ full: "ЗП № 5-5", short: "5-5" });
  });

  it("parses single number '3'", () => {
    expect(parseGnbNumber("3")).toEqual({ full: "ЗП № 3", short: "3" });
  });
});
