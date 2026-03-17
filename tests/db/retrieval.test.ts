/**
 * Tests for Retrieval API — Phase 3.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { getDb, closeDb } from "../../src/db/client.js";
import { createRepos } from "../../src/db/repositories.js";
import {
  findPersonByName,
  findPersonById,
  findDocsByPerson,
  getObjectProfile,
  findTransitionsByObject,
  findReusablePipeDocs,
  findReusableMaterialDocs,
  findLatestSignatoryDocs,
  getBaseKnowledgeForDraft,
} from "../../src/db/retrieval.js";

let tmpDir: string;
let db: ReturnType<typeof getDb>;
let repos: ReturnType<typeof createRepos>;

function seedTestData() {
  // Orgs
  repos.orgs.upsert({ id: "oek", name: "АО «ОЭК»", short_name: "АО «ОЭК»" });
  repos.orgs.upsert({ id: "stroytrest", name: "АНО «ОЭК Стройтрест»", short_name: "АНО «ОЭК Стройтрест»" });
  repos.orgs.upsert({ id: "sis", name: "ООО «СПЕЦИНЖСТРОЙ»", short_name: "ООО «СПЕЦИНЖСТРОЙ»" });

  // People
  repos.people.upsert({ id: "gaydukov", full_name: "Гайдуков Н.И.", surname: "Гайдуков", position: "Главный специалист ОТН", org_id: "oek", nrs_id: "C-71-259039", nrs_date: "23.09.2022" });
  repos.people.upsert({ id: "korobkov", full_name: "Коробков Ю.Н.", surname: "Коробков", position: "Мастер по ЭРС СВРЭС", org_id: "oek" });
  repos.people.upsert({ id: "buryak", full_name: "Буряк А.М.", surname: "Буряк", position: "Начальник участка", org_id: "stroytrest" });
  repos.people.upsert({ id: "shcheglov", full_name: "Щеглов Р.А.", surname: "Щеглов", position: "Начальник участка", org_id: "sis" });

  // Person documents
  repos.personDocs.insert({ person_id: "gaydukov", doc_type: "распоряжение", doc_number: "01/3349-р", doc_date: "14.10.2024", role_granted: "tech", is_current: 1 });
  repos.personDocs.insert({ person_id: "buryak", doc_type: "приказ", doc_number: "699", doc_date: "01.10.2025", role_granted: "sign2", is_current: 1 });
  repos.personDocs.insert({ person_id: "shcheglov", doc_type: "приказ", doc_number: "265", doc_date: "06.10.2025", role_granted: "sign3", is_current: 1 });

  // Customer + object
  repos.customers.upsert({ id: "kraft", name: "Крафт", org_id: "oek" }, ["крафт", "kraft"]);
  repos.objects.upsert({ id: "kraft-marino", customer_id: "kraft", short_name: "Марьино", official_name: "Резервирование электроснабжения РП 70046", default_address: "г. Москва, Огородный проезд, д. 14" });

  // Transition
  repos.transitions.insert({
    id: "kraft-marino-5-5", object_id: "kraft-marino", gnb_number: "ЗП № 5-5", gnb_number_short: "5-5",
    status: "finalized", address: "г. Москва, Огородный проезд, д. 14, стр. 3",
    project_number: "04-ОЭКСТ-КС-25-ТКР.1.ГЧ", profile_length: 194.67, plan_length: 190.22,
    pipe_mark: "Труба ЭЛЕКТРОПАЙП 225/170", pipe_diameter_mm: 225,
    created_at: "2025-12-22T00:00:00Z",
  });

  // Transition signatories
  repos.transitionSigs.insert({ transition_id: "kraft-marino-5-5", role: "sign1", person_id: "korobkov", org_id: "oek" });
  repos.transitionSigs.insert({ transition_id: "kraft-marino-5-5", role: "sign2", person_id: "buryak", org_id: "stroytrest" });
  repos.transitionSigs.insert({ transition_id: "kraft-marino-5-5", role: "tech", person_id: "gaydukov", org_id: "oek" });
  repos.transitionSigs.insert({ transition_id: "kraft-marino-5-5", role: "sign3", person_id: "shcheglov", org_id: "sis" });

  // Transition orgs
  repos.transitionOrgs.upsert({ transition_id: "kraft-marino-5-5", role: "customer", org_id: "oek" });
  repos.transitionOrgs.upsert({ transition_id: "kraft-marino-5-5", role: "contractor", org_id: "stroytrest" });
  repos.transitionOrgs.upsert({ transition_id: "kraft-marino-5-5", role: "designer", org_id: "sis" });

  // Material + document
  repos.materials.upsert({ id: "pipe-ep-225", material_type: "pipe", name: "Труба ЭЛЕКТРОПАЙП 225/170" });
  repos.documents.insert({ id: "doc-passport-13043", doc_type: "pipe_passport", doc_number: "13043", doc_date: "18.10.2025", status: "approved", origin: "extraction" });
  repos.documentLinks.insert({ document_id: "doc-passport-13043", link_type: "material", target_id: "pipe-ep-225", relation: "passport" });
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gnb-ret-test-"));
  db = getDb(tmpDir);
  repos = createRepos(db);
  seedTestData();
});

afterEach(() => {
  closeDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// === Person lookup ===

describe("findPersonByName", () => {
  it("finds Гайдуков by surname", () => {
    const results = findPersonByName(db, "Гайдуков");
    expect(results).toHaveLength(1);
    expect(results[0].person.id).toBe("gaydukov");
    expect(results[0].org?.short_name).toBe("АО «ОЭК»");
  });

  it("includes current documents", () => {
    const results = findPersonByName(db, "Гайдуков");
    expect(results[0].currentDocs).toHaveLength(1);
    expect(results[0].currentDocs[0].doc_number).toBe("01/3349-р");
  });

  it("includes transition history", () => {
    const results = findPersonByName(db, "Гайдуков");
    expect(results[0].transitionHistory).toHaveLength(1);
    expect(results[0].transitionHistory[0].gnbNumber).toBe("ЗП № 5-5");
    expect(results[0].transitionHistory[0].role).toBe("tech");
  });

  it("finds by partial name", () => {
    expect(findPersonByName(db, "Коробков")).toHaveLength(1);
    expect(findPersonByName(db, "Буряк")).toHaveLength(1);
    expect(findPersonByName(db, "Щеглов")).toHaveLength(1);
  });

  it("returns empty for unknown", () => {
    expect(findPersonByName(db, "Иванов")).toHaveLength(0);
  });
});

// === Object profile ===

describe("getObjectProfile", () => {
  it("returns object with transitions and signatories", () => {
    const profile = getObjectProfile(db, "kraft-marino");
    expect(profile).not.toBeNull();
    expect(profile!.object.short_name).toBe("Марьино");
    expect(profile!.transitions).toHaveLength(1);
    expect(profile!.lastFinalized?.gnb_number).toBe("ЗП № 5-5");
    expect(profile!.lastSignatories).toHaveLength(4);
  });

  it("lastSignatories include names and roles", () => {
    const profile = getObjectProfile(db, "kraft-marino")!;
    const tech = profile.lastSignatories.find((s) => s.role === "tech");
    expect(tech).toBeDefined();
    expect(tech!.fullName).toBe("Гайдуков Н.И.");
    expect(tech!.orgName).toBe("АО «ОЭК»");
  });

  it("returns null for unknown object", () => {
    expect(getObjectProfile(db, "nonexistent")).toBeNull();
  });
});

// === Reusable docs ===

describe("findReusablePipeDocs", () => {
  it("finds pipe passport linked to material", () => {
    const docs = findReusablePipeDocs(db, "kraft-marino");
    expect(docs.length).toBeGreaterThanOrEqual(1);
    expect(docs[0].document.doc_number).toBe("13043");
    expect(docs[0].materialName).toContain("ЭЛЕКТРОПАЙП");
  });
});

describe("findReusableMaterialDocs", () => {
  it("returns empty when no material docs", () => {
    expect(findReusableMaterialDocs(db, "bentonite")).toHaveLength(0);
  });
});

// === Latest signatory docs ===

describe("findLatestSignatoryDocs", () => {
  it("returns current docs for person", () => {
    const docs = findLatestSignatoryDocs(db, "gaydukov");
    expect(docs).toHaveLength(1);
    expect(docs[0].doc_type).toBe("распоряжение");
  });
});

// === Base knowledge for draft ===

describe("getBaseKnowledgeForDraft", () => {
  it("returns full context for object", () => {
    const ctx = getBaseKnowledgeForDraft(db, "kraft-marino");
    expect(ctx.object).toBeDefined();
    expect(ctx.object!.lastFinalized?.gnb_number).toBe("ЗП № 5-5");
    expect(ctx.lastTransition?.profile_length).toBe(194.67);
    expect(ctx.reusablePipeDocs.length).toBeGreaterThanOrEqual(1);
  });

  it("resolves mentioned people", () => {
    const ctx = getBaseKnowledgeForDraft(db, "kraft-marino", ["Гайдуков", "Щеглов"]);
    expect(ctx.mentionedPeople).toHaveLength(2);
    expect(ctx.mentionedPeople.find((p) => p.person.surname === "Гайдуков")).toBeDefined();
    expect(ctx.mentionedPeople.find((p) => p.person.surname === "Щеглов")).toBeDefined();
  });

  it("returns empty for unknown object", () => {
    const ctx = getBaseKnowledgeForDraft(db, "nonexistent");
    expect(ctx.object).toBeUndefined();
    expect(ctx.lastTransition).toBeUndefined();
  });
});
