/**
 * Tests for Phase 8: Storage document naming.
 */

import { describe, it, expect } from "vitest";
import { buildStorageFileName, extractExtension } from "../../src/storage/document-naming.js";

describe("buildStorageFileName", () => {
  describe("pipe passport", () => {
    it("builds full name with number and mark", () => {
      const name = buildStorageFileName("pipe_passport", {
        docNumber: "13043",
        mark: "ЭЛЕКТРОПАЙП 225",
        originalExt: ".pdf",
      });
      expect(name).toBe("Паспорт качества №13043 ЭЛЕКТРОПАЙП 225.pdf");
    });

    it("builds name with number only", () => {
      const name = buildStorageFileName("passport_pipe", {
        docNumber: "13043",
        originalExt: ".pdf",
      });
      expect(name).toBe("Паспорт качества №13043.pdf");
    });

    it("builds minimal name without number and mark", () => {
      const name = buildStorageFileName("pipe_passport", {});
      expect(name).toBe("Паспорт качества.pdf");
    });
  });

  describe("certificate", () => {
    it("builds name with number", () => {
      const name = buildStorageFileName("certificate", {
        docNumber: "Н00180-24",
        originalExt: ".pdf",
      });
      expect(name).toBe("Сертификат соответствия Н00180-24.pdf");
    });

    it("builds name without number", () => {
      const name = buildStorageFileName("pipe_certificate", {
        originalExt: ".pdf",
      });
      expect(name).toBe("Сертификат соответствия.pdf");
    });
  });

  describe("order / appointment", () => {
    it("builds full name with number and date", () => {
      const name = buildStorageFileName("order", {
        docNumber: "01/3349-р",
        docDate: "14.10.2024",
        originalExt: ".pdf",
      });
      expect(name).toBe("Распоряжение ТН №01/3349-р от 14.10.2024.pdf");
    });

    it("builds name with number only", () => {
      const name = buildStorageFileName("order_tech", {
        docNumber: "01/3349-р",
      });
      expect(name).toBe("Распоряжение ТН №01/3349-р.pdf");
    });

    it("handles appointment_letter same as order", () => {
      const name = buildStorageFileName("appointment_letter", {
        docNumber: "699",
        docDate: "01.10.2025",
      });
      expect(name).toBe("Распоряжение ТН №699 от 01.10.2025.pdf");
    });
  });

  describe("executive scheme", () => {
    it("builds name with GNB number", () => {
      const name = buildStorageFileName("executive_scheme", {
        gnbNumberShort: "5-5",
        originalExt: ".pdf",
      });
      expect(name).toBe("ИС ГНБ 5-5.pdf");
    });

    it("builds minimal name without GNB number", () => {
      const name = buildStorageFileName("executive_scheme", {});
      expect(name).toBe("ИС ГНБ.pdf");
    });
  });

  describe("generated acts", () => {
    it("builds acts name with sequential number and GNB", () => {
      const name = buildStorageFileName("generated_internal_acts", {
        sequentialNumber: 5,
        gnbNumberShort: "5-5",
      });
      expect(name).toBe("5 Акты ЗП ГНБ 5-5.xlsx");
    });

    it("builds AOSR name with sequential number and GNB", () => {
      const name = buildStorageFileName("generated_aosr", {
        sequentialNumber: 5,
        gnbNumberShort: "5-5",
      });
      expect(name).toBe("5 АОСР ОЭК-ГНБ 5-5.xlsx");
    });

    it("builds acts name without sequential number", () => {
      const name = buildStorageFileName("prior_internal_act", {
        gnbNumberShort: "3",
      });
      expect(name).toBe("Акты ЗП ГНБ 3.xlsx");
    });
  });

  describe("summary_excel", () => {
    it("uses xlsx extension", () => {
      const name = buildStorageFileName("summary_excel", { originalExt: ".xlsx" });
      expect(name).toBe("Сводка.xlsx");
    });

    it("converts pdf extension to xlsx", () => {
      const name = buildStorageFileName("summary_excel", { originalExt: ".pdf" });
      expect(name).toBe("Сводка.xlsx");
    });
  });

  describe("unknown type", () => {
    it("generates generic name", () => {
      const name = buildStorageFileName("something_random", { originalExt: ".pdf" });
      expect(name).toBe("Документ.pdf");
    });
  });

  describe("default extension", () => {
    it("defaults to .pdf when no extension provided", () => {
      const name = buildStorageFileName("pipe_passport", { docNumber: "123" });
      expect(name).toBe("Паспорт качества №123.pdf");
    });
  });
});

describe("extractExtension", () => {
  it("extracts .pdf", () => {
    expect(extractExtension("document.pdf")).toBe(".pdf");
  });

  it("extracts .xlsx", () => {
    expect(extractExtension("file.xlsx")).toBe(".xlsx");
  });

  it("extracts .jpg", () => {
    expect(extractExtension("photo.jpg")).toBe(".jpg");
  });

  it("returns .pdf for undefined", () => {
    expect(extractExtension(undefined)).toBe(".pdf");
  });

  it("returns .pdf for file without extension", () => {
    expect(extractExtension("noext")).toBe(".pdf");
  });
});
