/**
 * Tests for Phase 5.6: document registry, naming, requirements, storage plan.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { IntakeDraftStore } from "../../src/store/intake-drafts.js";
import { TransitionStore } from "../../src/store/transitions.js";
import type { Transition } from "../../src/domain/types.js";
import type { RegistryDocument, DocumentKind } from "../../src/intake/document-registry-types.js";
import {
  buildDocumentRegistry,
  deriveRegistryDocument,
  getReusableBaseDocuments,
  getReusablePipeDocs,
  getReusableMaterialDocs,
  getReusableSignatoryDocs,
} from "../../src/intake/document-registry.js";
import {
  buildNameProposal,
  suggestCanonicalName,
  validateNameProposal,
  applyApprovedName,
} from "../../src/intake/naming.js";
import {
  evaluateDocumentCoverage,
  getMissingRequired,
  getMissingOptional,
  allRequiredPresent,
} from "../../src/intake/document-requirements.js";
import { buildStoragePlan, suggestDocumentTargetFolder } from "../../src/intake/storage-plan.js";
import { buildDocumentReview, formatDocumentReview } from "../../src/intake/document-review.js";

let tmpDir: string;
let store: IntakeDraftStore;

function makeRegDoc(overrides: Partial<RegistryDocument>): RegistryDocument {
  return {
    doc_id: "reg-1",
    source_id: "s1",
    kind: "pipe_passport",
    doc_class: "passport_pipe",
    confidence: "high",
    source_type: "pdf",
    received_at: new Date().toISOString(),
    inherited: false,
    status: "detected",
    ...overrides,
  };
}

function seedBaseTransition(): Transition {
  return {
    id: "kraft-marino-3",
    status: "finalized",
    created_at: "2025-11-15T10:00:00.000Z",
    customer: "Крафт",
    object: "Марьино",
    gnb_number: "ЗП № 3",
    gnb_number_short: "3",
    title_line: "Строительство КЛ 10кВ методом ГНБ",
    object_name: "Марьино",
    address: "г. Москва, Огородный д.11",
    project_number: "ШФ-123",
    executor: "ООО «СПЕЦИНЖСТРОЙ»",
    start_date: { day: 1, month: "ноября", year: 2025 },
    end_date: { day: 15, month: "ноября", year: 2025 },
    refs: { person_ids: [], org_ids: [] },
    organizations: {
      customer: { id: "oek", name: "АО «ОЭК»", short_name: "АО «ОЭК»", ogrn: "", inn: "", legal_address: "", phone: "", sro_name: "" },
      contractor: { id: "st", name: "АНО «ОЭК Стройтрест»", short_name: "АНО «ОЭК Стройтрест»", ogrn: "", inn: "", legal_address: "", phone: "", sro_name: "" },
    },
    signatories: {
      sign1_customer: { person_id: "k", role: "sign1", org_description: "АО «ОЭК»", position: "Мастер", full_name: "Коробков Ю.Н.", aosr_full_line: "" },
      sign2_contractor: { person_id: "b", role: "sign2", org_description: "АНО «ОЭК Стройтрест»", position: "Начальник участка", full_name: "Буряк А.М.", aosr_full_line: "" },
      tech_supervisor: { person_id: "g", role: "tech", org_description: "АО «ОЭК»", position: "Гл. спец. ОТН", full_name: "Гайдуков Н.И.", aosr_full_line: "" },
    },
    pipe: { mark: "ЭЛЕКТРОПАЙП 225/170", diameter: "d=225", diameter_mm: 225, quality_passport: "№13043" },
    gnb_params: { profile_length: 63.3, plan_length: 61.7, pipe_count: 2 },
    materials: { ukpt: "есть", plugs: "есть" },
    source_docs: [],
    generated_files: [],
    revisions: [],
  };
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "doc-reg-"));
  store = new IntakeDraftStore(tmpDir);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// === Naming ===

describe("naming", () => {
  it("builds complete proposal for pipe passport with number and date", () => {
    const doc = makeRegDoc({ kind: "pipe_passport", doc_number: "13043", doc_date: "18.10.2025", original_file_name: "scan.pdf" });
    const p = buildNameProposal(doc);
    expect(p.suggested_name).toContain("Паспорт качества");
    expect(p.suggested_name).toContain("13043");
    expect(p.suggested_name).toContain("18.10.2025");
    expect(p.complete).toBe(true);
    expect(p.missing_parts).toHaveLength(0);
  });

  it("builds incomplete proposal when number missing", () => {
    const doc = makeRegDoc({ kind: "pipe_passport", doc_date: "18.10.2025" });
    const p = buildNameProposal(doc);
    expect(p.complete).toBe(false);
    expect(p.missing_parts).toContain("номер документа");
  });

  it("builds incomplete proposal when date missing", () => {
    const doc = makeRegDoc({ kind: "pipe_passport", doc_number: "13043" });
    const p = buildNameProposal(doc);
    expect(p.complete).toBe(false);
    expect(p.missing_parts).toContain("дата документа");
  });

  it("builds proposal for bentonite", () => {
    const doc = makeRegDoc({ kind: "bentonite_passport", doc_number: "456", doc_date: "01.01.2025" });
    const p = buildNameProposal(doc);
    expect(p.suggested_name).toContain("Бентонит");
    expect(p.complete).toBe(true);
  });

  it("builds proposal for certificate", () => {
    const doc = makeRegDoc({ kind: "pipe_certificate", doc_number: "Н00180/24", doc_date: "04.07.2024" });
    const p = buildNameProposal(doc);
    expect(p.suggested_name).toContain("Сертификат");
    expect(p.complete).toBe(true);
  });

  it("builds proposal for УКПТ", () => {
    const doc = makeRegDoc({ kind: "ukpt_doc", doc_number: "АИ22-3465", doc_date: "29.03.2023" });
    expect(suggestCanonicalName(doc)).toContain("УКПТ");
  });

  it("builds proposal for plugs", () => {
    const doc = makeRegDoc({ kind: "plugs_doc" });
    const p = buildNameProposal(doc);
    expect(p.suggested_name).toContain("Заглушки");
    expect(p.complete).toBe(false);
  });

  it("builds proposal for cord", () => {
    const doc = makeRegDoc({ kind: "cord_doc", doc_number: "100", doc_date: "01.01.2025" });
    expect(suggestCanonicalName(doc)).toContain("Шнур");
  });

  it("includes related_entity in name", () => {
    const doc = makeRegDoc({ kind: "pipe_passport", related_entity: "225/170", doc_number: "13043", doc_date: "18.10.2025" });
    expect(suggestCanonicalName(doc)).toContain("225/170");
  });

  it("executive scheme does not require number/date", () => {
    const doc = makeRegDoc({ kind: "executive_scheme" });
    const p = buildNameProposal(doc);
    expect(p.complete).toBe(true); // schemes don't need doc number/date
  });

  it("validateNameProposal rejects short names", () => {
    expect(validateNameProposal("a").valid).toBe(false);
  });

  it("validateNameProposal rejects names without extension", () => {
    expect(validateNameProposal("Паспорт качества").valid).toBe(false);
  });

  it("validateNameProposal accepts good names", () => {
    expect(validateNameProposal("Паспорт трубы №13043 от 18.10.2025.pdf").valid).toBe(true);
  });

  it("applyApprovedName sets approved status", () => {
    const doc = makeRegDoc({});
    const approved = applyApprovedName(doc, "Финальное имя.pdf");
    expect(approved.approved_name).toBe("Финальное имя.pdf");
    expect(approved.status).toBe("approved");
  });
});

// === refineMaterialKind / deriveRegistryDocument regression (Bug 4) ===

describe("material kind refinement", () => {
  it("pipe_passport is NOT reclassified to cord_doc when summary mentions шнур (Bug 4)", () => {
    // Simulates a pipe passport whose extraction summary mentions "шнур"
    const doc = deriveRegistryDocument(
      {
        source_id: "doc-1",
        source_type: "pdf",
        doc_class: "passport_pipe",
        received_at: new Date().toISOString(),
        parse_status: "parsed",
        short_summary: "Паспорт качества №13043 от 18.10.2025, труба ЭЛЕКТРОПАЙП 225/170, шнур в комплекте",
      },
      { id: "test", chat_id: 1, status: "collecting", created_at: "", updated_at: "", sources: [], fields: [], data: {} },
    );
    // Kind must remain pipe_passport, not become cord_doc
    expect(doc.kind).toBe("pipe_passport");
    expect(doc.name_proposal?.suggested_name).toContain("Паспорт качества");
    expect(doc.name_proposal?.suggested_name).not.toContain("Шнур");
  });
});

// === Document requirements ===

describe("document-requirements", () => {
  it("all required missing for empty doc set", () => {
    const checks = evaluateDocumentCoverage([]);
    const missing = getMissingRequired(checks);
    expect(missing.length).toBeGreaterThan(0);
    expect(missing.some((m) => m.requirement.kind === "executive_scheme")).toBe(true);
    expect(missing.some((m) => m.requirement.kind === "pipe_passport")).toBe(true);
  });

  it("executive_scheme present reduces missing", () => {
    const docs = [makeRegDoc({ kind: "executive_scheme", doc_class: "executive_scheme" })];
    const checks = evaluateDocumentCoverage(docs);
    const missing = getMissingRequired(checks);
    expect(missing.some((m) => m.requirement.kind === "executive_scheme")).toBe(false);
  });

  it("inherited doc counts as present", () => {
    const docs = [makeRegDoc({ kind: "pipe_passport", inherited: true })];
    const checks = evaluateDocumentCoverage(docs);
    const pipeCheck = checks.find((c) => c.requirement.kind === "pipe_passport");
    expect(pipeCheck?.status).toBe("inherited");
  });

  it("rejected doc does not count", () => {
    const docs = [makeRegDoc({ kind: "pipe_passport", status: "rejected" })];
    const checks = evaluateDocumentCoverage(docs);
    const pipeCheck = checks.find((c) => c.requirement.kind === "pipe_passport");
    expect(pipeCheck?.status).toBe("missing");
  });

  it("allRequiredPresent false for empty set", () => {
    expect(allRequiredPresent(evaluateDocumentCoverage([]))).toBe(false);
  });

  it("optional documents listed", () => {
    const checks = evaluateDocumentCoverage([]);
    const optional = getMissingOptional(checks);
    expect(optional.some((o) => o.requirement.kind === "bentonite_passport")).toBe(true);
  });
});

// === Registry builder ===

describe("document-registry", () => {
  it("builds registry from draft sources", () => {
    const draft = store.create(1);
    store.addSource(draft.id, {
      source_id: "s1",
      source_type: "pdf",
      original_file_name: "ИС ГНБ 5-5.pdf",
      doc_class: "executive_scheme",
      received_at: new Date().toISOString(),
      parse_status: "parsed",
    });
    store.addSource(draft.id, {
      source_id: "s2",
      source_type: "pdf",
      original_file_name: "Паспорт трубы.pdf",
      doc_class: "passport_pipe",
      received_at: new Date().toISOString(),
      parse_status: "parsed",
    });

    const loaded = store.get(draft.id)!;
    const registry = buildDocumentRegistry(loaded);

    expect(registry.documents).toHaveLength(2);
    expect(registry.documents[0].kind).toBe("executive_scheme");
    expect(registry.documents[1].kind).toBe("pipe_passport");
    expect(registry.requirements.length).toBeGreaterThan(0);
  });

  it("deriveRegistryDocument creates name proposal", () => {
    const draft = store.create(1);
    const source = {
      source_id: "s1",
      source_type: "pdf" as const,
      original_file_name: "паспорт.pdf",
      doc_class: "passport_pipe" as const,
      received_at: new Date().toISOString(),
      parse_status: "parsed" as const,
      short_summary: "Паспорт №13043 от 18.10.2025",
    };
    store.addSource(draft.id, source);

    const loaded = store.get(draft.id)!;
    const doc = deriveRegistryDocument(source, loaded);

    expect(doc.kind).toBe("pipe_passport");
    expect(doc.doc_number).toBe("13043");
    expect(doc.name_proposal).toBeDefined();
    expect(doc.name_proposal!.suggested_name).toContain("Паспорт качества");
  });
});

// === Base document reuse ===

describe("base document reuse", () => {
  it("getReusableBaseDocuments returns pipe and signatory docs", () => {
    const base = seedBaseTransition();
    const docs = getReusableBaseDocuments(base);
    expect(docs.length).toBeGreaterThan(3);
    expect(docs.some((d) => d.kind === "pipe_passport")).toBe(true);
    expect(docs.some((d) => d.kind === "order_tech")).toBe(true);
  });

  it("getReusablePipeDocs returns only pipe docs", () => {
    const base = seedBaseTransition();
    const docs = getReusablePipeDocs(base);
    expect(docs.every((d) => d.kind === "pipe_passport" || d.kind === "pipe_certificate")).toBe(true);
  });

  it("getReusableMaterialDocs returns material docs", () => {
    const base = seedBaseTransition();
    const docs = getReusableMaterialDocs(base);
    expect(docs.some((d) => d.kind === "ukpt_doc")).toBe(true);
    expect(docs.some((d) => d.kind === "plugs_doc")).toBe(true);
  });

  it("getReusableSignatoryDocs returns signatory docs", () => {
    const base = seedBaseTransition();
    const docs = getReusableSignatoryDocs(base);
    expect(docs.length).toBe(3); // sign1 + sign2 + tech (no sign3)
  });
});

// === Storage plan ===

describe("storage-plan", () => {
  it("builds plan with correct base path", () => {
    const docs = [
      makeRegDoc({ kind: "executive_scheme", doc_class: "executive_scheme" }),
      makeRegDoc({ kind: "pipe_passport", doc_id: "reg-2" }),
    ];
    const plan = buildStoragePlan("Крафт", "Марьино", "5-5", docs);

    expect(plan.base_path).toBe("Крафт/Марьино/ЗП 5-5");
    expect(plan.folders.length).toBe(6); // 6 OEK folders
  });

  it("places executive scheme in correct folder", () => {
    const docs = [makeRegDoc({ kind: "executive_scheme", doc_class: "executive_scheme" })];
    const plan = buildStoragePlan("Крафт", "Марьино", "5-5", docs);

    const isFolder = plan.folders.find((f) => f.folder === "01 ИС");
    expect(isFolder?.documents).toHaveLength(1);
  });

  it("suggestDocumentTargetFolder works", () => {
    expect(suggestDocumentTargetFolder("executive_scheme")).toBe("01 ИС");
    expect(suggestDocumentTargetFolder("pipe_passport")).toBe("02 Паспорта трубы");
    expect(suggestDocumentTargetFolder("bentonite_passport")).toBe("03 Материалы");
    expect(suggestDocumentTargetFolder("order_tech")).toBe("04 Приказы");
    expect(suggestDocumentTargetFolder("generated_internal_acts")).toBe("05 Исполнительная документация");
    expect(suggestDocumentTargetFolder("other")).toBe("06 Прочее");
  });
});

// === Document review ===

describe("document-review", () => {
  it("builds review summary for draft with sources", () => {
    const draft = store.create(1);
    store.addSource(draft.id, {
      source_id: "s1",
      source_type: "pdf",
      doc_class: "executive_scheme",
      received_at: new Date().toISOString(),
      parse_status: "parsed",
    });

    const loaded = store.get(draft.id)!;
    const summary = buildDocumentReview(loaded);

    expect(summary.total_documents).toBe(1);
    expect(summary.required_present).toBeGreaterThan(0);
    expect(summary.missing_required.length).toBeGreaterThan(0); // still missing pipe_passport etc.
  });

  it("formatDocumentReview produces compact text", () => {
    const draft = store.create(1);
    const loaded = store.get(draft.id)!;
    const summary = buildDocumentReview(loaded);
    const text = formatDocumentReview(summary);

    expect(text).toContain("Документы:");
    expect(text).toContain("Не хватает:");
  });

  it("includes reusable base docs when base provided", () => {
    const base = seedBaseTransition();
    const draft = store.create(1);
    const loaded = store.get(draft.id)!;
    const summary = buildDocumentReview(loaded, base);

    expect(summary.reusable_from_base.length).toBeGreaterThan(0);
  });
});

// === Approval state ===

describe("approval state", () => {
  it("document starts as detected", () => {
    const doc = makeRegDoc({});
    expect(doc.status).toBe("detected");
  });

  it("applyApprovedName transitions to approved", () => {
    const doc = makeRegDoc({ status: "awaiting_name_confirmation" });
    const approved = applyApprovedName(doc, "Final.pdf");
    expect(approved.status).toBe("approved");
    expect(approved.approved_name).toBe("Final.pdf");
  });

  it("rejected doc not counted in requirements", () => {
    const docs = [makeRegDoc({ kind: "pipe_passport", status: "rejected" })];
    const checks = evaluateDocumentCoverage(docs);
    expect(checks.find((c) => c.requirement.kind === "pipe_passport")?.status).toBe("missing");
  });

  it("superseded doc not counted in requirements", () => {
    const docs = [makeRegDoc({ kind: "pipe_passport", status: "superseded" })];
    const checks = evaluateDocumentCoverage(docs);
    expect(checks.find((c) => c.requirement.kind === "pipe_passport")?.status).toBe("missing");
  });
});
