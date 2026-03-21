import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { IntakeDraftStore } from "../../src/store/intake-drafts.js";
import { TransitionStore } from "../../src/store/transitions.js";
import { getDb, closeDb } from "../../src/db/client.js";
import { createRepos } from "../../src/db/repositories.js";

vi.mock("../../src/db/reasoning.js", () => ({
  processIntakeText: vi.fn(),
}));

import { processTextWithReasoning } from "../../src/intake/reasoning-handler.js";
import { processIntakeText } from "../../src/db/reasoning.js";

let memoryDir: string;
let draftStore: IntakeDraftStore;
let transitionStore: TransitionStore;

describe("processTextWithReasoning", () => {
  beforeEach(() => {
    memoryDir = fs.mkdtempSync(path.join(os.tmpdir(), "gnb-reasoning-handler-"));
    draftStore = new IntakeDraftStore(memoryDir);
    transitionStore = new TransitionStore(memoryDir);
    vi.mocked(processIntakeText).mockReset();
  });

  afterEach(() => {
    closeDb();
    fs.rmSync(memoryDir, { recursive: true, force: true });
  });

  it("returns lookup summary directly for lookup_query", async () => {
    const draft = draftStore.create(1);
    vi.mocked(processIntakeText).mockResolvedValue({
      intent: "lookup_query",
      fieldUpdates: [],
      summary: "Гайдуков Н.И. — технадзор ОТН, распоряжение 01/3349-р",
    });

    const result = await processTextWithReasoning(
      1,
      "что у нас по Гайдукову?",
      draft.id,
      { intakeDrafts: draftStore, transitions: transitionStore } as never,
      memoryDir,
      "kraft-marino",
      vi.fn(),
    );

    expect(result).not.toBeNull();
    expect(result!.usedReasoning).toBe(true);
    expect(result!.response.message).toContain("Гайдуков");
    expect(result!.updatedFields).toHaveLength(0);
  });

  it("applies signatory-only assignment from reasoning output", async () => {
    const draft = draftStore.create(1);
    const db = getDb(memoryDir);
    const repos = createRepos(db);

    repos.orgs.upsert({ id: "oek", name: "АО «ОЭК»", short_name: "АО «ОЭК»" });
    repos.people.upsert({
      id: "gaydukov",
      full_name: "Гайдуков Н.И.",
      surname: "Гайдуков",
      position: "Главный специалист ОТН",
      org_id: "oek",
      nrs_id: "C-71-259039",
      nrs_date: "23.09.2022",
    });
    repos.personDocs.insert({
      person_id: "gaydukov",
      doc_type: "распоряжение",
      doc_number: "01/3349-р",
      doc_date: "14.10.2024",
      is_current: 1,
    });

    vi.mocked(processIntakeText).mockResolvedValue({
      intent: "signatory_assignment",
      fieldUpdates: [],
      signatoryUpdates: [{ role: "tech", personId: "gaydukov", action: "assign" }],
      summary: "Назначен технадзор Гайдуков Н.И.",
    });

    const result = await processTextWithReasoning(
      1,
      "технадзор Гайдуков",
      draft.id,
      { intakeDrafts: draftStore, transitions: transitionStore } as never,
      memoryDir,
      "kraft-marino",
      vi.fn(),
    );

    expect(result).not.toBeNull();
    // DB enrichment now handles bare surnames — reasoning may or may not be used
    expect(result!.updatedFields.length).toBeGreaterThanOrEqual(1);
    const techField = result!.updatedFields.find((f) => f.name === "signatories.tech_supervisor");
    expect(techField).toBeDefined();
    // DB enrichment should produce full_name from DB
    const techVal = techField!.value as Record<string, unknown>;
    expect(techVal.full_name).toBe("Гайдуков Н.И.");
    // Also auto-fills organizations.customer from person's org
    const orgField = result!.updatedFields.find((f) => f.name === "organizations.customer");
    expect(orgField).toBeDefined();
  });

  it("returns owner clarification for needs_manual signatory instead of generic fallback", async () => {
    const draft = draftStore.create(1);
    vi.mocked(processIntakeText).mockResolvedValue({
      intent: "signatory_assignment",
      fieldUpdates: [],
      signatoryUpdates: [{
        role: "sign1",
        personId: "",
        action: "needs_manual",
        newPersonData: { fullName: "Иванов А.А.", position: "Мастер" },
      }],
      questionsForOwner: ["Иванов А.А. не найден в базе. Уточните организацию и должность."],
      summary: "Иванов не найден в базе",
    });

    const result = await processTextWithReasoning(
      1,
      "мастер Иванов А.А.",
      draft.id,
      { intakeDrafts: draftStore, transitions: transitionStore } as never,
      memoryDir,
      "kraft-marino",
      vi.fn(),
    );

    expect(result).not.toBeNull();
    expect(result!.usedReasoning).toBe(true);
    expect(result!.updatedFields).toHaveLength(0);
    expect(result!.response.message).toContain("Иванов");
    expect(result!.response.message).not.toContain("Не распознал структурированных данных");
  });
});
