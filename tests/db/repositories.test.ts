/**
 * Tests for SQLite repositories — Phase 2 foundation.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { getDb, closeDb } from "../../src/db/client.js";
import { createRepos } from "../../src/db/repositories.js";

let tmpDir: string;
let repos: ReturnType<typeof createRepos>;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gnb-db-test-"));
  const db = getDb(tmpDir);
  repos = createRepos(db);
});

afterEach(() => {
  closeDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// === Organizations ===

describe("OrgRepo", () => {
  it("upserts and retrieves organization", () => {
    repos.orgs.upsert({ id: "oek", name: "АО «ОЭК»", short_name: "АО «ОЭК»" });
    const org = repos.orgs.getById("oek");
    expect(org).toBeDefined();
    expect(org!.name).toBe("АО «ОЭК»");
  });

  it("updates on second upsert", () => {
    repos.orgs.upsert({ id: "oek", name: "OLD", short_name: "OLD" });
    repos.orgs.upsert({ id: "oek", name: "АО «ОЭК»", short_name: "АО «ОЭК»" });
    expect(repos.orgs.getById("oek")!.name).toBe("АО «ОЭК»");
  });

  it("getAll returns all orgs", () => {
    repos.orgs.upsert({ id: "a", name: "A", short_name: "A" });
    repos.orgs.upsert({ id: "b", name: "B", short_name: "B" });
    expect(repos.orgs.getAll()).toHaveLength(2);
  });
});

// === People ===

describe("PeopleRepo", () => {
  it("upserts and retrieves person", () => {
    repos.orgs.upsert({ id: "oek", name: "АО «ОЭК»", short_name: "АО «ОЭК»" });
    repos.people.upsert({
      id: "gaydukov",
      full_name: "Гайдуков Н.И.",
      surname: "Гайдуков",
      position: "Главный специалист ОТН",
      org_id: "oek",
      nrs_id: "C-71-259039",
    });
    const p = repos.people.getById("gaydukov");
    expect(p).toBeDefined();
    expect(p!.full_name).toBe("Гайдуков Н.И.");
    expect(p!.org_id).toBe("oek");
  });

  it("findBySurname returns matching people", () => {
    repos.people.upsert({ id: "g1", full_name: "Гайдуков Н.И.", surname: "Гайдуков" });
    repos.people.upsert({ id: "k1", full_name: "Коробков Ю.Н.", surname: "Коробков" });

    const results = repos.people.findBySurname("Гайдуков");
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("g1");
  });

  it("findByName does partial match", () => {
    repos.people.upsert({ id: "b1", full_name: "Буряк А.М.", surname: "Буряк" });
    expect(repos.people.findByName("Буряк")).toHaveLength(1);
    expect(repos.people.findByName("А.М.")).toHaveLength(1);
  });
});

// === Person Documents ===

describe("PersonDocRepo", () => {
  it("inserts and retrieves person documents", () => {
    repos.people.upsert({ id: "g1", full_name: "Гайдуков Н.И.", surname: "Гайдуков" });
    repos.personDocs.insert({
      person_id: "g1",
      doc_type: "распоряжение",
      doc_number: "01/3349-р",
      doc_date: "14.10.2024",
      role_granted: "tech",
      is_current: 1,
    });

    const docs = repos.personDocs.getCurrentByPersonId("g1");
    expect(docs).toHaveLength(1);
    expect(docs[0].doc_number).toBe("01/3349-р");
  });
});

// === Customers ===

describe("CustomerRepo", () => {
  it("upserts customer with aliases", () => {
    repos.customers.upsert({ id: "kraft", name: "Крафт" }, ["крафт", "kraft"]);
    const c = repos.customers.getById("kraft");
    expect(c).toBeDefined();
    expect(c!.name).toBe("Крафт");
  });

  it("findByAlias works case-insensitive", () => {
    repos.customers.upsert({ id: "kraft", name: "Крафт" }, ["крафт"]);
    const found = repos.customers.findByAlias("крафт");
    expect(found).toBeDefined();
    expect(found!.id).toBe("kraft");
  });

  it("findByAlias returns null for unknown", () => {
    expect(repos.customers.findByAlias("nonexistent")).toBeNull();
  });
});

// === Objects ===

describe("ObjectRepo", () => {
  it("upserts and retrieves objects by customer", () => {
    repos.customers.upsert({ id: "kraft", name: "Крафт" }, []);
    repos.objects.upsert({ id: "kraft-marino", customer_id: "kraft", short_name: "Марьино" });

    const objs = repos.objects.getByCustomerId("kraft");
    expect(objs).toHaveLength(1);
    expect(objs[0].short_name).toBe("Марьино");
  });
});

// === Transitions ===

describe("TransitionRepo", () => {
  it("inserts and retrieves transition", () => {
    repos.customers.upsert({ id: "kraft", name: "Крафт" }, []);
    repos.objects.upsert({ id: "kraft-marino", customer_id: "kraft", short_name: "Марьино" });
    repos.transitions.insert({
      id: "kraft-marino-5-5",
      object_id: "kraft-marino",
      gnb_number: "ЗП № 5-5",
      gnb_number_short: "5-5",
      status: "finalized",
      address: "г. Москва, Огородный д.11",
      profile_length: 194.67,
      plan_length: 190.22,
    });

    const t = repos.transitions.getById("kraft-marino-5-5");
    expect(t).toBeDefined();
    expect(t!.gnb_number).toBe("ЗП № 5-5");
    expect(t!.profile_length).toBe(194.67);
  });

  it("getLastFinalized returns most recent", () => {
    repos.customers.upsert({ id: "k", name: "K" }, []);
    repos.objects.upsert({ id: "k-m", customer_id: "k", short_name: "M" });
    repos.transitions.insert({ id: "t1", object_id: "k-m", gnb_number: "ЗП № 3", status: "finalized", created_at: "2025-11-01T00:00:00Z" });
    repos.transitions.insert({ id: "t2", object_id: "k-m", gnb_number: "ЗП № 5-5", status: "finalized", created_at: "2025-12-01T00:00:00Z" });

    const last = repos.transitions.getLastFinalized("k-m");
    expect(last).toBeDefined();
    expect(last!.id).toBe("t2");
  });

  it("getByObjectId returns all transitions for object", () => {
    repos.customers.upsert({ id: "k", name: "K" }, []);
    repos.objects.upsert({ id: "k-m", customer_id: "k", short_name: "M" });
    repos.transitions.insert({ id: "t1", object_id: "k-m", gnb_number: "ЗП № 3", status: "finalized" });
    repos.transitions.insert({ id: "t2", object_id: "k-m", gnb_number: "ЗП № 5-5", status: "draft" });

    expect(repos.transitions.getByObjectId("k-m")).toHaveLength(2);
  });
});

// === Transition Signatories ===

describe("TransitionSignatoryRepo", () => {
  it("inserts and retrieves signatories", () => {
    repos.orgs.upsert({ id: "oek", name: "АО «ОЭК»", short_name: "АО «ОЭК»" });
    repos.customers.upsert({ id: "k", name: "K" }, []);
    repos.objects.upsert({ id: "k-m", customer_id: "k", short_name: "M" });
    repos.transitions.insert({ id: "t1", object_id: "k-m", gnb_number: "ЗП № 5-5", status: "finalized" });
    repos.people.upsert({ id: "g1", full_name: "Гайдуков Н.И.", surname: "Гайдуков" });

    repos.transitionSigs.insert({
      transition_id: "t1",
      role: "tech",
      person_id: "g1",
      org_id: "oek",
    });

    const sigs = repos.transitionSigs.getByTransitionId("t1");
    expect(sigs).toHaveLength(1);
    expect(sigs[0].role).toBe("tech");
    expect(sigs[0].person_id).toBe("g1");
  });
});

// === Documents ===

describe("DocumentRepo", () => {
  it("inserts and retrieves documents", () => {
    repos.documents.insert({
      id: "doc-is-5-5",
      doc_type: "executive_scheme",
      original_filename: "ИС ГНБ 5-5.pdf",
      origin: "extraction",
    });

    const doc = repos.documents.getById("doc-is-5-5");
    expect(doc).toBeDefined();
    expect(doc!.doc_type).toBe("executive_scheme");
  });

  it("updateStatus works", () => {
    repos.documents.insert({ id: "d1", doc_type: "pipe_passport" });
    repos.documents.updateStatus("d1", "approved");
    expect(repos.documents.getById("d1")!.status).toBe("approved");
  });
});

// === Document Links ===

describe("DocumentLinkRepo", () => {
  it("inserts and retrieves by target", () => {
    repos.documents.insert({ id: "d1", doc_type: "pipe_passport" });
    repos.documentLinks.insert({
      document_id: "d1",
      link_type: "person",
      target_id: "gaydukov",
      relation: "order",
    });

    const links = repos.documentLinks.getByTarget("person", "gaydukov");
    expect(links).toHaveLength(1);
    expect(links[0].document_id).toBe("d1");
  });
});

// === Field Values (Provenance) ===

describe("FieldValueRepo", () => {
  it("inserts field value and retrieves current", () => {
    repos.fieldValues.insert({
      entity_type: "transition",
      entity_id: "t1",
      field_name: "address",
      value: JSON.stringify("г. Москва, Огородный д.11"),
      source_type: "pdf",
      source_id: "doc-is-5-5",
    });

    const fv = repos.fieldValues.getCurrent("transition", "t1", "address");
    expect(fv).toBeDefined();
    expect(JSON.parse(fv!.value!)).toBe("г. Москва, Огородный д.11");
  });

  it("supersedes old value when inserting new", () => {
    repos.fieldValues.insert({
      entity_type: "transition", entity_id: "t1", field_name: "address",
      value: '"OLD"', source_type: "manual", source_id: "owner",
    });
    repos.fieldValues.insert({
      entity_type: "transition", entity_id: "t1", field_name: "address",
      value: '"NEW"', source_type: "pdf", source_id: "doc-1",
    });

    const current = repos.fieldValues.getCurrent("transition", "t1", "address");
    expect(JSON.parse(current!.value!)).toBe("NEW");

    // Old one should be superseded
    const all = repos.fieldValues.getAllCurrent("transition", "t1");
    const addressValues = all.filter((f) => f.field_name === "address");
    expect(addressValues).toHaveLength(1); // only current
  });
});

// === Conflict Resolutions ===

describe("ConflictResolutionRepo", () => {
  it("inserts and retrieves conflict resolution", () => {
    repos.conflictResolutions.insert({
      entity_type: "transition",
      entity_id: "t1",
      field_name: "tech_supervisor",
      chosen_value: '"Гайдуков"',
      rejected_value: '"Попов"',
      resolution: "accept_new",
    });

    const crs = repos.conflictResolutions.getByEntity("transition", "t1");
    expect(crs).toHaveLength(1);
    expect(crs[0].resolution).toBe("accept_new");
  });
});

// === Materials ===

describe("MaterialRepo", () => {
  it("upserts and retrieves by type", () => {
    repos.materials.upsert({
      id: "pipe-ep-225",
      material_type: "pipe",
      name: "Труба ЭЛЕКТРОПАЙП 225/170",
    });

    const pipes = repos.materials.getByType("pipe");
    expect(pipes).toHaveLength(1);
    expect(pipes[0].name).toContain("ЭЛЕКТРОПАЙП");
  });
});

// === DB bootstrap ===

describe("DB bootstrap", () => {
  it("creates all tables and indexes without error", () => {
    // If we got here, tables were created in beforeEach
    expect(repos.orgs.getAll()).toHaveLength(0);
    expect(repos.people.getAll()).toHaveLength(0);
  });

  it("DB file exists on disk", () => {
    expect(fs.existsSync(path.join(tmpDir, "gnb.db"))).toBe(true);
  });
});
