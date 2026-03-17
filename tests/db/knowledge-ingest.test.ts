/**
 * Tests for knowledge ingest + alias lookups — Phase 6-7.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { getDb, closeDb } from "../../src/db/client.js";
import { createRepos } from "../../src/db/repositories.js";
import { persistIngestResult } from "../../src/db/knowledge-ingest.js";
import { findCustomer, findObject, findObjectGlobal } from "../../src/db/retrieval.js";
import type { KnowledgeIngestOutput } from "../../src/db/reasoning-contracts.js";

let tmpDir: string;
let db: ReturnType<typeof getDb>;
let repos: ReturnType<typeof createRepos>;

function seedData() {
  repos.orgs.upsert({ id: "oek", name: "АО «ОЭК»", short_name: "АО «ОЭК»" });
  repos.customers.upsert({ id: "kraft", name: "Крафт", org_id: "oek" }, ["крафт", "kraft"]);
  repos.objects.upsert({ id: "kraft-marino", customer_id: "kraft", short_name: "Марьино", official_name: "Резервирование электроснабжения РП 70046" });
  repos.people.upsert({ id: "gaydukov", full_name: "Гайдуков Н.И.", surname: "Гайдуков", org_id: "oek" });
  repos.materials.upsert({ id: "pipe-ep-225", material_type: "pipe", name: "Труба ЭЛЕКТРОПАЙП 225/170" });
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gnb-ingest-test-"));
  db = getDb(tmpDir);
  repos = createRepos(db);
  seedData();
});

afterEach(() => {
  closeDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// === Knowledge ingest persistence ===

describe("persistIngestResult", () => {
  it("persists person document with link", () => {
    const result: KnowledgeIngestOutput = {
      docKind: "person_document",
      extractedData: { docType: "распоряжение", docNumber: "01/3349-р", docDate: "14.10.2024", role: "tech" },
      suggestedLinks: { personId: "gaydukov", objectId: null, materialId: null, transitionId: null },
      missingLinks: [],
      questionsForOwner: [],
      summary: "Распоряжение ТН Гайдукова",
    };

    const { documentId, persisted } = persistIngestResult(db, result, "/path/to/file.pdf");
    expect(persisted).toBe(true);

    // Document created
    const doc = repos.documents.getById(documentId);
    expect(doc).toBeDefined();
    expect(doc!.status).toBe("approved");
    expect(doc!.origin).toBe("manual");

    // Link to person created
    const links = repos.documentLinks.getByTarget("person", "gaydukov");
    expect(links.length).toBeGreaterThanOrEqual(1);

    // Person document created
    const pDocs = repos.personDocs.getCurrentByPersonId("gaydukov");
    expect(pDocs.length).toBeGreaterThanOrEqual(1);
    expect(pDocs.some((d) => d.doc_number === "01/3349-р")).toBe(true);
  });

  it("persists pipe document with material link", () => {
    const result: KnowledgeIngestOutput = {
      docKind: "pipe_document",
      extractedData: { docNumber: "13043", docDate: "18.10.2025" },
      suggestedLinks: { personId: null, objectId: null, materialId: "pipe-ep-225", transitionId: null },
      missingLinks: [],
      questionsForOwner: [],
      summary: "Паспорт трубы ЭЛЕКТРОПАЙП",
    };

    const { persisted } = persistIngestResult(db, result);
    expect(persisted).toBe(true);

    const links = repos.documentLinks.getByTarget("material", "pipe-ep-225");
    expect(links.length).toBeGreaterThanOrEqual(1);
  });

  it("persists scheme with object link", () => {
    const result: KnowledgeIngestOutput = {
      docKind: "scheme",
      extractedData: {},
      suggestedLinks: { personId: null, objectId: "kraft-marino", materialId: null, transitionId: null },
      missingLinks: [],
      questionsForOwner: [],
      summary: "ИС ГНБ",
    };

    const { persisted } = persistIngestResult(db, result);
    expect(persisted).toBe(true);

    const links = repos.documentLinks.getByTarget("object", "kraft-marino");
    expect(links.length).toBeGreaterThanOrEqual(1);
  });
});

// === Alias-friendly lookups ===

describe("findCustomer", () => {
  it("finds by exact alias", () => {
    expect(findCustomer(db, "крафт")?.id).toBe("kraft");
    expect(findCustomer(db, "kraft")?.id).toBe("kraft");
  });

  it("finds by name partial match", () => {
    expect(findCustomer(db, "Крафт")?.id).toBe("kraft");
  });

  it("returns null for unknown", () => {
    expect(findCustomer(db, "Неизвестный")).toBeNull();
  });
});

describe("findObject", () => {
  it("finds by short name", () => {
    expect(findObject(db, "kraft", "Марьино")?.id).toBe("kraft-marino");
    expect(findObject(db, "kraft", "марьино")?.id).toBe("kraft-marino");
  });

  it("finds by official name partial", () => {
    expect(findObject(db, "kraft", "Резервирование")?.id).toBe("kraft-marino");
    expect(findObject(db, "kraft", "РП 70046")?.id).toBe("kraft-marino");
  });

  it("returns null for unknown", () => {
    expect(findObject(db, "kraft", "Неизвестный")).toBeNull();
  });
});

describe("findObjectGlobal", () => {
  it("finds across all customers", () => {
    expect(findObjectGlobal(db, "Марьино")?.id).toBe("kraft-marino");
  });
});
