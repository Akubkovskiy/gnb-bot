import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { TransitionStore } from "../../src/store/transitions.js";
import type { Transition } from "../../src/domain/types.js";

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "gnb-store-"));
}

function makeTransition(overrides: Partial<Transition> = {}): Transition {
  return {
    id: "kraft-marino-5-5",
    status: "draft",
    created_at: "2025-12-22T10:00:00.000Z",
    customer: "Крафт",
    object: "Марьино",
    gnb_number: "ЗП № 5-5",
    gnb_number_short: "5-5",
    title_line: "Test",
    object_name: "Test object",
    address: "г. Москва",
    project_number: "ШФ-123",
    executor: "ООО «СПЕЦИНЖСТРОЙ»",
    start_date: { day: 10, month: "декабря", year: 2025 },
    end_date: { day: 22, month: "декабря", year: 2025 },
    refs: { person_ids: [], org_ids: [] },
    organizations: {} as any,
    signatories: {} as any,
    pipe: { mark: "Test", diameter: "d=225", diameter_mm: 225 },
    gnb_params: { profile_length: 194.67, pipe_count: 2 },
    source_docs: [],
    generated_files: [],
    revisions: [],
    ...overrides,
  };
}

describe("TransitionStore", () => {
  let tmpDir: string;
  let store: TransitionStore;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    store = new TransitionStore(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("list returns empty array initially", () => {
    expect(store.list()).toEqual([]);
  });

  it("create and get", () => {
    const t = makeTransition();
    store.create(t);
    expect(store.get("kraft-marino-5-5")).toMatchObject({ id: "kraft-marino-5-5" });
  });

  it("create throws on duplicate id", () => {
    store.create(makeTransition());
    expect(() => store.create(makeTransition())).toThrow("already exists");
  });

  it("getByGnbNumber", () => {
    store.create(makeTransition());
    expect(store.getByGnbNumber("5-5")?.id).toBe("kraft-marino-5-5");
    expect(store.getByGnbNumber("9-9")).toBeNull();
  });

  it("findByCustomerObject", () => {
    store.create(makeTransition());
    store.create(makeTransition({ id: "kraft-marino-5-6", gnb_number_short: "5-6", gnb_number: "ЗП № 5-6" }));
    store.create(makeTransition({ id: "oek-ogorodnyy-1", customer: "ОЭК", object: "Огородный", gnb_number_short: "1" }));

    expect(store.findByCustomerObject("Крафт", "Марьино")).toHaveLength(2);
    expect(store.findByCustomerObject("ОЭК", "Огородный")).toHaveLength(1);
  });

  it("finalize sets status and finalized_at", () => {
    store.create(makeTransition());
    store.finalize("kraft-marino-5-5");
    const t = store.get("kraft-marino-5-5")!;
    expect(t.status).toBe("finalized");
    expect(t.finalized_at).toBeDefined();
  });

  it("addRevision appends to revisions array", () => {
    store.create(makeTransition());
    store.addRevision("kraft-marino-5-5", {
      version: "изм 1",
      date: new Date().toISOString(),
      changes: "адрес изменён",
      diff: { address: { old: "ул. Х", new: "ул. Y" } },
      generated_files: [],
    });
    const t = store.get("kraft-marino-5-5")!;
    expect(t.revisions).toHaveLength(1);
    expect(t.revisions[0].version).toBe("изм 1");
  });

  it("getLastForObject returns most recent", () => {
    store.create(makeTransition({ created_at: "2025-12-01T00:00:00Z" }));
    store.create(makeTransition({
      id: "kraft-marino-5-6",
      gnb_number_short: "5-6",
      gnb_number: "ЗП № 5-6",
      created_at: "2025-12-22T00:00:00Z",
    }));
    const last = store.getLastForObject("Крафт", "Марьино");
    expect(last?.id).toBe("kraft-marino-5-6");
  });
});
