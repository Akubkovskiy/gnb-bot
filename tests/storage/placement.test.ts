/**
 * Tests for Phase 8: Storage placement module.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// We need to mock getWorkRoot / getProjectDir before importing placement
// because they depend on config.
import { vi } from "vitest";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gnb-storage-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// Mock paths module so getWorkRoot and getProjectDir use tmpDir
vi.mock("../../src/utils/paths.js", () => ({
  getWorkRoot: () => tmpDir,
  getProjectDir: (customer: string, object: string) =>
    path.join(tmpDir, customer, object),
  getMemoryDir: () => path.join(tmpDir, ".gnb-memory"),
  getTempDir: () => path.join(tmpDir, "temp_files"),
}));

// Mock logger
vi.mock("../../src/logger.js", () => ({
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  },
}));

// Import after mocks
const { buildStoragePlan, ensureStorageDirs, getTargetDir, placeDocument, buildPlacementReport, placeIntakeDocuments } = await import("../../src/storage/placement.js");

describe("buildStoragePlan", () => {
  it("returns correct paths for standard transition", () => {
    const plan = buildStoragePlan("Крафт", "Марьино", "5-5");

    expect(plan.transitionDir).toBe(path.join(tmpDir, "Крафт", "Марьино", "ЗП 5-5"));
    expect(plan.execDocsDir).toBe(path.join(tmpDir, "Крафт", "Марьино", "ЗП 5-5", "Исполнительная документация"));
    expect(plan.pipePassportsDir).toBe(path.join(tmpDir, "Крафт", "Марьино", "ЗП 5-5", "Паспорта на трубу"));
    expect(plan.certificatesDir).toBe(path.join(tmpDir, "Крафт", "Марьино", "ЗП 5-5", "Сертификаты"));
    expect(plan.ordersDir).toBe(path.join(tmpDir, "Крафт", "Марьино", "ЗП 5-5", "Приказы и распоряжения"));
    expect(plan.schemesDir).toBe(path.join(tmpDir, "Крафт", "Марьино", "ЗП 5-5", "Исполнительные схемы"));
    expect(plan.miscDir).toBe(path.join(tmpDir, "Крафт", "Марьино", "ЗП 5-5", "Прочее"));
  });

  it("handles simple GNB number", () => {
    const plan = buildStoragePlan("Крафт", "Огородный", "3");
    expect(plan.transitionDir).toContain("ЗП 3");
  });
});

describe("ensureStorageDirs", () => {
  it("creates all directories from plan", () => {
    const plan = buildStoragePlan("Крафт", "Марьино", "5-5");
    ensureStorageDirs(plan);

    expect(fs.existsSync(plan.transitionDir)).toBe(true);
    expect(fs.existsSync(plan.execDocsDir)).toBe(true);
    expect(fs.existsSync(plan.pipePassportsDir)).toBe(true);
    expect(fs.existsSync(plan.certificatesDir)).toBe(true);
    expect(fs.existsSync(plan.ordersDir)).toBe(true);
    expect(fs.existsSync(plan.schemesDir)).toBe(true);
    expect(fs.existsSync(plan.miscDir)).toBe(true);
  });

  it("is idempotent (calling twice does not error)", () => {
    const plan = buildStoragePlan("Крафт", "Марьино", "5-5");
    ensureStorageDirs(plan);
    ensureStorageDirs(plan); // second call should not throw
    expect(fs.existsSync(plan.transitionDir)).toBe(true);
  });
});

describe("getTargetDir", () => {
  it("routes executive_scheme to schemesDir", () => {
    const plan = buildStoragePlan("Крафт", "Марьино", "5-5");
    expect(getTargetDir(plan, "executive_scheme")).toBe(plan.schemesDir);
  });

  it("routes pipe_passport to pipePassportsDir", () => {
    const plan = buildStoragePlan("Крафт", "Марьино", "5-5");
    expect(getTargetDir(plan, "pipe_passport")).toBe(plan.pipePassportsDir);
  });

  it("routes passport_pipe to pipePassportsDir", () => {
    const plan = buildStoragePlan("Крафт", "Марьино", "5-5");
    expect(getTargetDir(plan, "passport_pipe")).toBe(plan.pipePassportsDir);
  });

  it("routes certificate to certificatesDir", () => {
    const plan = buildStoragePlan("Крафт", "Марьино", "5-5");
    expect(getTargetDir(plan, "certificate")).toBe(plan.certificatesDir);
  });

  it("routes order to ordersDir", () => {
    const plan = buildStoragePlan("Крафт", "Марьино", "5-5");
    expect(getTargetDir(plan, "order")).toBe(plan.ordersDir);
  });

  it("routes appointment_letter to ordersDir", () => {
    const plan = buildStoragePlan("Крафт", "Марьино", "5-5");
    expect(getTargetDir(plan, "appointment_letter")).toBe(plan.ordersDir);
  });

  it("routes prior_aosr to execDocsDir", () => {
    const plan = buildStoragePlan("Крафт", "Марьино", "5-5");
    expect(getTargetDir(plan, "prior_aosr")).toBe(plan.execDocsDir);
  });

  it("routes prior_internal_act to execDocsDir", () => {
    const plan = buildStoragePlan("Крафт", "Марьино", "5-5");
    expect(getTargetDir(plan, "prior_internal_act")).toBe(plan.execDocsDir);
  });

  it("routes summary_excel to execDocsDir", () => {
    const plan = buildStoragePlan("Крафт", "Марьино", "5-5");
    expect(getTargetDir(plan, "summary_excel")).toBe(plan.execDocsDir);
  });

  it("routes unknown type to miscDir", () => {
    const plan = buildStoragePlan("Крафт", "Марьино", "5-5");
    expect(getTargetDir(plan, "unknown")).toBe(plan.miscDir);
    expect(getTargetDir(plan, "something_random")).toBe(plan.miscDir);
  });

  it("routes order_tech to ordersDir", () => {
    const plan = buildStoragePlan("Крафт", "Марьино", "5-5");
    expect(getTargetDir(plan, "order_tech")).toBe(plan.ordersDir);
  });

  it("routes pipe_certificate to certificatesDir", () => {
    const plan = buildStoragePlan("Крафт", "Марьино", "5-5");
    expect(getTargetDir(plan, "pipe_certificate")).toBe(plan.certificatesDir);
  });
});

describe("placeDocument", () => {
  it("copies file to correct directory", () => {
    const plan = buildStoragePlan("Крафт", "Марьино", "5-5");
    ensureStorageDirs(plan);

    // Create a source file
    const sourceFile = path.join(tmpDir, "test-passport.pdf");
    fs.writeFileSync(sourceFile, "test content");

    const result = placeDocument(plan, "pipe_passport", sourceFile);

    expect(result.success).toBe(true);
    expect(result.targetDir).toBe(plan.pipePassportsDir);
    expect(fs.existsSync(result.targetFile)).toBe(true);
    // Original should still exist (copy, not move)
    expect(fs.existsSync(sourceFile)).toBe(true);
    // Content should match
    expect(fs.readFileSync(result.targetFile, "utf-8")).toBe("test content");
  });

  it("uses custom target filename when provided", () => {
    const plan = buildStoragePlan("Крафт", "Марьино", "5-5");
    ensureStorageDirs(plan);

    const sourceFile = path.join(tmpDir, "raw-file.pdf");
    fs.writeFileSync(sourceFile, "content");

    const result = placeDocument(plan, "certificate", sourceFile, "Сертификат соответствия H00180-24.pdf");

    expect(result.success).toBe(true);
    expect(path.basename(result.targetFile)).toBe("Сертификат соответствия H00180-24.pdf");
  });

  it("creates target directory if it does not exist", () => {
    const plan = buildStoragePlan("Крафт", "Марьино", "6-6");
    // Don't call ensureStorageDirs — placeDocument should create dir

    const sourceFile = path.join(tmpDir, "test.pdf");
    fs.writeFileSync(sourceFile, "content");

    const result = placeDocument(plan, "executive_scheme", sourceFile);

    expect(result.success).toBe(true);
    expect(fs.existsSync(result.targetDir)).toBe(true);
  });

  it("returns error record if source file does not exist", () => {
    const plan = buildStoragePlan("Крафт", "Марьино", "5-5");
    ensureStorageDirs(plan);

    const result = placeDocument(plan, "pipe_passport", "/nonexistent/file.pdf");

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

describe("buildPlacementReport", () => {
  it("reports successful placements", () => {
    const plan = buildStoragePlan("Крафт", "Марьино", "5-5");
    ensureStorageDirs(plan);

    const sourceFile = path.join(tmpDir, "test.pdf");
    fs.writeFileSync(sourceFile, "content");

    const record = placeDocument(plan, "pipe_passport", sourceFile, "Паспорт.pdf");
    const report = buildPlacementReport([record]);

    expect(report.totalPlaced).toBe(1);
    expect(report.totalFailed).toBe(0);
    expect(report.text).toContain("Размещено документов: 1");
    expect(report.text).toContain("Паспорт.pdf");
    expect(report.text).toContain("Паспорта на трубу");
  });

  it("reports failures", () => {
    const report = buildPlacementReport([{
      docType: "pipe_passport",
      sourceFile: "/missing.pdf",
      targetFile: "/somewhere/missing.pdf",
      targetDir: "/somewhere",
      success: false,
      error: "File not found",
    }]);

    expect(report.totalPlaced).toBe(0);
    expect(report.totalFailed).toBe(1);
    expect(report.text).toContain("Не удалось разместить: 1");
  });

  it("reports empty list", () => {
    const report = buildPlacementReport([]);
    expect(report.text).toContain("Нет документов для размещения");
  });

  it("reports mixed success and failure", () => {
    const plan = buildStoragePlan("Крафт", "Марьино", "5-5");
    ensureStorageDirs(plan);

    const sourceFile = path.join(tmpDir, "test.pdf");
    fs.writeFileSync(sourceFile, "content");

    const ok = placeDocument(plan, "pipe_passport", sourceFile, "Паспорт.pdf");
    const fail = {
      docType: "certificate",
      sourceFile: "/missing.pdf",
      targetFile: "/somewhere/missing.pdf",
      targetDir: "/somewhere",
      success: false,
      error: "not found",
    };

    const report = buildPlacementReport([ok, fail]);
    expect(report.totalPlaced).toBe(1);
    expect(report.totalFailed).toBe(1);
  });
});

describe("placeIntakeDocuments", () => {
  it("places multiple documents and returns report", () => {
    const plan = buildStoragePlan("Крафт", "Марьино", "5-5");

    const file1 = path.join(tmpDir, "passport.pdf");
    const file2 = path.join(tmpDir, "scheme.pdf");
    fs.writeFileSync(file1, "passport content");
    fs.writeFileSync(file2, "scheme content");

    const report = placeIntakeDocuments(plan, [
      { docType: "pipe_passport", filePath: file1 },
      { docType: "executive_scheme", filePath: file2 },
    ]);

    expect(report.totalPlaced).toBe(2);
    expect(report.totalFailed).toBe(0);
    // Dirs were created
    expect(fs.existsSync(plan.pipePassportsDir)).toBe(true);
    expect(fs.existsSync(plan.schemesDir)).toBe(true);
  });

  it("handles missing source files gracefully", () => {
    const plan = buildStoragePlan("Крафт", "Марьино", "5-5");

    const report = placeIntakeDocuments(plan, [
      { docType: "certificate", filePath: "/nonexistent.pdf" },
    ]);

    expect(report.totalPlaced).toBe(0);
    expect(report.totalFailed).toBe(1);
    expect(report.placements[0].error).toContain("не найден");
  });

  it("handles empty filePath", () => {
    const plan = buildStoragePlan("Крафт", "Марьино", "5-5");

    const report = placeIntakeDocuments(plan, [
      { docType: "certificate", filePath: "" },
    ]);

    expect(report.totalPlaced).toBe(0);
    expect(report.totalFailed).toBe(1);
  });
});
