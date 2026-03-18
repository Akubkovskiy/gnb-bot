/**
 * Integration tests for standalone knowledge ingest flow.
 *
 * Tests the full pipeline: session → extraction mock → persist → DB verification.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { getDb, closeDb } from "../../src/db/client.js";
import { createRepos } from "../../src/db/repositories.js";
import { persistIngestResult } from "../../src/db/knowledge-ingest.js";
import {
  setIngestSession,
  getIngestSession,
  clearIngestSession,
  hasActiveIngestSession,
  handleIngestTextAnswer,
  _resetAllIngestSessions,
} from "../../src/intake/ingest-session.js";
import type { KnowledgeIngestOutput } from "../../src/db/reasoning-contracts.js";

const CHAT_ID = 77777;
let tmpDir: string;
let db: ReturnType<typeof getDb>;
let repos: ReturnType<typeof createRepos>;

function seedData() {
  repos.orgs.upsert({ id: "oek", name: "АО «ОЭК»", short_name: "АО «ОЭК»" });
  repos.customers.upsert({ id: "kraft", name: "Крафт", org_id: "oek" }, ["крафт"]);
  repos.objects.upsert({ id: "kraft-marino", customer_id: "kraft", short_name: "Марьино" });
  repos.people.upsert({ id: "gaydukov", full_name: "Гайдуков Н.И.", surname: "Гайдуков", org_id: "oek" });
  repos.materials.upsert({ id: "pipe-ep-225", material_type: "pipe", name: "Труба ЭЛЕКТРОПАЙП 225/170" });
}

beforeEach(() => {
  _resetAllIngestSessions();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gnb-ingest-flow-"));
  db = getDb(tmpDir);
  repos = createRepos(db);
  seedData();
});

afterEach(() => {
  closeDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("Full ingest flow: auto-link", () => {
  it("persists document when all links resolved", () => {
    const result: KnowledgeIngestOutput = {
      docKind: "person_document",
      extractedData: { docType: "распоряжение", docNumber: "01/3349-р" },
      suggestedLinks: { personId: "gaydukov", objectId: "kraft-marino", materialId: null, transitionId: null },
      missingLinks: [],
      questionsForOwner: [],
      summary: "Распоряжение ТН Гайдукова",
    };

    const { documentId, persisted } = persistIngestResult(db, result, "/tmp/test.pdf");
    expect(persisted).toBe(true);

    const doc = repos.documents.getById(documentId);
    expect(doc).toBeDefined();
    expect(doc!.status).toBe("approved");

    // Person link
    const personLinks = repos.documentLinks.getByTarget("person", "gaydukov");
    expect(personLinks.length).toBeGreaterThanOrEqual(1);

    // Object link
    const objectLinks = repos.documentLinks.getByTarget("object", "kraft-marino");
    expect(objectLinks.length).toBeGreaterThanOrEqual(1);
  });
});

describe("Full ingest flow: questions → owner answer → persist", () => {
  it("handles awaiting_link → owner answers → persist", () => {
    const pendingResult: KnowledgeIngestOutput = {
      docKind: "pipe_document",
      extractedData: { docNumber: "13043" },
      suggestedLinks: { personId: null, objectId: null, materialId: "pipe-ep-225", transitionId: null },
      missingLinks: ["objectId"],
      questionsForOwner: ["К какому объекту относится этот паспорт?"],
      summary: "Паспорт трубы ЭЛЕКТРОПАЙП",
    };

    // Start session
    setIngestSession(CHAT_ID, {
      state: "awaiting_link",
      pendingResult,
      filePath: "/tmp/passport.pdf",
      fileName: "passport.pdf",
      startedAt: Date.now(),
    });

    expect(hasActiveIngestSession(CHAT_ID)).toBe(true);

    // Owner answers
    const answer = handleIngestTextAnswer(CHAT_ID, "Марьино");
    expect(answer.updated).toBe(true);
    expect(answer.result).toBeDefined();
    expect(answer.result!.extractedData.ownerAnswer).toBe("Марьино");

    // Persist with the answer
    const { documentId, persisted } = persistIngestResult(db, answer.result!);
    expect(persisted).toBe(true);

    // Material link exists
    const materialLinks = repos.documentLinks.getByTarget("material", "pipe-ep-225");
    expect(materialLinks.length).toBeGreaterThanOrEqual(1);

    // Clean up session
    clearIngestSession(CHAT_ID);
    expect(hasActiveIngestSession(CHAT_ID)).toBe(false);
  });

  it("handles skip links → persist without missing links", () => {
    const pendingResult: KnowledgeIngestOutput = {
      docKind: "material_document",
      extractedData: { docNumber: "99" },
      suggestedLinks: { personId: null, objectId: null, materialId: null, transitionId: null },
      missingLinks: ["materialId", "objectId"],
      questionsForOwner: ["Какой это материал?", "К какому объекту?"],
      summary: "Сертификат на материал",
    };

    setIngestSession(CHAT_ID, {
      state: "awaiting_link",
      pendingResult,
      startedAt: Date.now(),
    });

    // Owner says skip
    const answer = handleIngestTextAnswer(CHAT_ID, "пропустить");
    expect(answer.updated).toBe(true);
    expect(answer.result!.missingLinks).toEqual([]);

    // Persist without links
    const { documentId, persisted } = persistIngestResult(db, answer.result!);
    expect(persisted).toBe(true);

    const doc = repos.documents.getById(documentId);
    expect(doc).toBeDefined();
    expect(doc!.status).toBe("approved");
  });

  it("handles cancel during awaiting_link", () => {
    setIngestSession(CHAT_ID, {
      state: "awaiting_link",
      pendingResult: {
        docKind: "unknown",
        extractedData: {},
        suggestedLinks: { personId: null, objectId: null, materialId: null, transitionId: null },
        missingLinks: ["objectId"],
        questionsForOwner: ["Что это?"],
        summary: "Документ",
      },
      startedAt: Date.now(),
    });

    const answer = handleIngestTextAnswer(CHAT_ID, "отмена");
    expect(answer.updated).toBe(false);
    expect(getIngestSession(CHAT_ID)).toBeNull();
  });
});

describe("Session isolation from intake sessions", () => {
  it("ingest session does not interfere with intake state", () => {
    // Both can coexist — ingest is checked first in handler, but they use separate maps
    setIngestSession(CHAT_ID, { state: "awaiting_link", startedAt: Date.now() });
    expect(hasActiveIngestSession(CHAT_ID)).toBe(true);

    clearIngestSession(CHAT_ID);
    expect(hasActiveIngestSession(CHAT_ID)).toBe(false);
  });
});
