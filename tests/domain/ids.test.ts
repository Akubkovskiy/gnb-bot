import { describe, it, expect } from "vitest";
import { slugify, generatePersonId, generateOrgId, generateTransitionId } from "../../src/domain/ids.js";

describe("slugify", () => {
  it("transliterates Cyrillic to Latin", () => {
    expect(slugify("Гайдуков")).toBe("gaydukov");
  });

  it("handles mixed Cyrillic and Latin", () => {
    expect(slugify("ООО Test")).toBe("ooo-test");
  });

  it("replaces non-alphanumeric with hyphens", () => {
    expect(slugify("ОЭК Стройтрест")).toBe("oek-stroytrest");
  });

  it("trims leading/trailing hyphens", () => {
    expect(slugify("  —Тест— ")).toBe("test");
  });
});

describe("generatePersonId", () => {
  it("Гайдуков Н.И. → gaydukov-ni", () => {
    expect(generatePersonId("Гайдуков Н.И.")).toBe("gaydukov-ni");
  });

  it("Буряк А.М. → buryak-am", () => {
    expect(generatePersonId("Буряк А.М.")).toBe("buryak-am");
  });

  it("Щеглов Р.А. → shcheglov-ra", () => {
    expect(generatePersonId("Щеглов Р.А.")).toBe("shcheglov-ra");
  });

  it("handles surname only", () => {
    expect(generatePersonId("Иванов")).toBe("ivanov");
  });

  it("throws on empty input", () => {
    expect(() => generatePersonId("")).toThrow();
  });
});

describe("generateOrgId", () => {
  it("АО «ОЭК» → oek", () => {
    expect(generateOrgId("АО «ОЭК»")).toBe("oek");
  });

  it("АНО «ОЭК Стройтрест» → oek-stroytrest", () => {
    expect(generateOrgId("АНО «ОЭК Стройтрест»")).toBe("oek-stroytrest");
  });

  it("ООО «СПЕЦИНЖСТРОЙ» → spetsinzhstroy", () => {
    expect(generateOrgId("ООО «СПЕЦИНЖСТРОЙ»")).toBe("spetsinzhstroy");
  });
});

describe("generateTransitionId", () => {
  it("generates from customer + object + number", () => {
    expect(generateTransitionId("Крафт", "Марьино", "5-5")).toBe("kraft-marino-5-5");
  });

  it("handles complex number format with Cyrillic in number", () => {
    expect(generateTransitionId("ОЭК", "Огородный", "10-1С")).toBe("oek-ogorodnyy-10-1s");
  });
});
