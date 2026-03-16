import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { DraftStore } from "../../src/store/drafts.js";

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "gnb-drafts-"));
}

describe("DraftStore", () => {
  let tmpDir: string;
  let store: DraftStore;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    store = new DraftStore(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("list returns empty initially", () => {
    expect(store.list()).toEqual([]);
  });

  it("create and get", () => {
    const draft = store.create("test-draft", 12345, 1, { customer: "Крафт" });
    expect(draft.id).toBe("test-draft");
    expect(draft.step).toBe(1);
    expect(draft.chat_id).toBe(12345);

    const retrieved = store.get("test-draft");
    expect(retrieved?.data.customer).toBe("Крафт");
  });

  it("update advances step and merges data", () => {
    store.create("test-draft", 12345, 1, { customer: "Крафт" });
    store.update("test-draft", 2, { object: "Марьино" });

    const d = store.get("test-draft")!;
    expect(d.step).toBe(2);
    expect(d.data.customer).toBe("Крафт");
    expect(d.data.object).toBe("Марьино");
  });

  it("delete removes draft file", () => {
    store.create("test-draft", 12345, 1, {});
    store.delete("test-draft");
    expect(store.get("test-draft")).toBeNull();
  });

  it("getByChatId finds active draft", () => {
    store.create("d1", 111, 1, {});
    store.create("d2", 222, 3, {});
    expect(store.getByChatId(222)?.id).toBe("d2");
    expect(store.getByChatId(999)).toBeNull();
  });

  it("listActive excludes expired drafts", () => {
    // Create a fresh draft
    store.create("fresh", 111, 1, {});

    // Create an expired draft (8 days ago)
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const expiredPath = path.join(tmpDir, "drafts", "expired.json");
    fs.writeFileSync(expiredPath, JSON.stringify({
      id: "expired",
      step: 1,
      chat_id: 222,
      data: {},
      created_at: eightDaysAgo,
      updated_at: eightDaysAgo,
    }));

    expect(store.listActive()).toHaveLength(1);
    expect(store.listActive()[0].id).toBe("fresh");
  });

  it("expireOld removes only expired drafts", () => {
    store.create("fresh", 111, 1, {});

    // Manually create expired draft
    const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const expiredPath = path.join(tmpDir, "drafts", "expired.json");
    fs.writeFileSync(expiredPath, JSON.stringify({
      id: "expired", step: 1, chat_id: 222, data: {},
      created_at: old, updated_at: old,
    }));

    const count = store.expireOld();
    expect(count).toBe(1);
    expect(store.list()).toHaveLength(1);
    expect(store.list()[0].id).toBe("fresh");
  });
});
