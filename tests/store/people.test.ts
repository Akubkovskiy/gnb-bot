import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { PeopleStore } from "../../src/store/people.js";
import type { Person } from "../../src/domain/types.js";

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "gnb-people-"));
}

const gaydukov: Person = {
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
  aosr_full_line: "Главный специалист ОТН АО «ОЭК» Гайдуков Н.И., идентификационный номер C-71-259039 от 23.09.2022, распоряжение №01/3349-р от 14.10.2024г.",
};

const korobkov: Person = {
  person_id: "korobkov-yun",
  full_name: "Коробков Ю.Н.",
  position: "Мастер по ЭРС СВРЭС",
  organization: "АО «ОЭК»",
  role: "sign1",
  aosr_full_line: "Мастер по ЭРС СВРЭС АО «ОЭК» Коробков Ю.Н.",
};

describe("PeopleStore", () => {
  let tmpDir: string;
  let store: PeopleStore;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    store = new PeopleStore(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("list returns empty initially", () => {
    expect(store.list()).toEqual([]);
  });

  it("add and get by person_id", () => {
    store.add(gaydukov);
    expect(store.get("gaydukov-ni")?.full_name).toBe("Гайдуков Н.И.");
  });

  it("add throws on duplicate", () => {
    store.add(gaydukov);
    expect(() => store.add(gaydukov)).toThrow("already exists");
  });

  it("findByName matches by surname prefix", () => {
    store.add(gaydukov);
    store.add(korobkov);

    expect(store.findByName("Гайдуков")).toHaveLength(1);
    expect(store.findByName("Коробков")).toHaveLength(1);
    expect(store.findByName("Иванов")).toHaveLength(0);
    // Case-insensitive
    expect(store.findByName("гайдуков")).toHaveLength(1);
  });

  it("update changes person data", () => {
    store.add(gaydukov);
    store.update("gaydukov-ni", { order_date: "01.01.2026" });
    expect(store.get("gaydukov-ni")?.order_date).toBe("01.01.2026");
    // Unchanged fields preserved
    expect(store.get("gaydukov-ni")?.nrs_id).toBe("C-71-259039");
  });
});
