/**
 * Tests for document classifier.
 */

import { describe, it, expect } from "vitest";
import {
  classifyByFilename,
  classifyText,
  classify,
  sourceTypeFromExt,
} from "../../src/intake/doc-classifier.js";

describe("classifyByFilename", () => {
  // Excel
  it("excel with акт гнб → prior_internal_act", () => {
    const r = classifyByFilename("5 Акты ЗП ГНБ 5-5.xlsx");
    expect(r.doc_class).toBe("prior_internal_act");
    expect(r.confidence).toBe("high");
  });

  it("excel with аоср → prior_aosr", () => {
    const r = classifyByFilename("АОСР ОЭК-ГНБ 5-5.xlsx");
    expect(r.doc_class).toBe("prior_aosr");
    expect(r.confidence).toBe("high");
  });

  it("generic excel → summary_excel", () => {
    const r = classifyByFilename("данные.xlsx");
    expect(r.doc_class).toBe("summary_excel");
    expect(r.confidence).toBe("medium");
  });

  // PDF
  it("pdf паспорт трубы → passport_pipe", () => {
    const r = classifyByFilename("Паспорт качества №13043.pdf");
    expect(r.doc_class).toBe("passport_pipe");
  });

  it("pdf сертификат → certificate", () => {
    const r = classifyByFilename("Сертификат соответствия.pdf");
    expect(r.doc_class).toBe("certificate");
  });

  it("pdf приказ → order", () => {
    const r = classifyByFilename("Приказ №699.pdf");
    expect(r.doc_class).toBe("order");
  });

  it("pdf распоряжение → order", () => {
    const r = classifyByFilename("Распоряжение №01-3349-р.pdf");
    expect(r.doc_class).toBe("order");
  });

  it("pdf назначение → appointment_letter", () => {
    const r = classifyByFilename("О назначении ответственного.pdf");
    expect(r.doc_class).toBe("appointment_letter");
  });

  it("pdf схема → executive_scheme", () => {
    const r = classifyByFilename("Исполнительная схема ЗП5.pdf");
    expect(r.doc_class).toBe("executive_scheme");
  });

  it("pdf unknown → unknown low", () => {
    const r = classifyByFilename("document.pdf");
    expect(r.doc_class).toBe("unknown");
    expect(r.confidence).toBe("low");
  });

  // Photo
  it("jpg → photo_of_doc", () => {
    const r = classifyByFilename("IMG_20251210.jpg");
    expect(r.doc_class).toBe("photo_of_doc");
  });

  // Unknown
  it("unknown extension → unknown low", () => {
    const r = classifyByFilename("readme.txt");
    expect(r.doc_class).toBe("unknown");
    expect(r.confidence).toBe("low");
  });
});

describe("classifyText", () => {
  it("паспорт качества → passport_pipe", () => {
    const r = classifyText("ПАСПОРТ КАЧЕСТВА №13043 Труба ЭЛЕКТРОПАЙП 225/170");
    expect(r.doc_class).toBe("passport_pipe");
    expect(r.confidence).toBe("high"); // 2 matches
  });

  it("сертификат соответствия → certificate", () => {
    const r = classifyText("СЕРТИФИКАТ СООТВЕТСТВИЯ №РОСС RU...");
    expect(r.doc_class).toBe("certificate");
  });

  it("приказ → order", () => {
    const r = classifyText("ПРИКАЗ №699 от 01.10.2025 О назначении");
    expect(r.doc_class).toBe("order");
  });

  it("акт освидетельствования скрытых работ → prior_aosr", () => {
    const r = classifyText("АКТ ОСВИДЕТЕЛЬСТВОВАНИЯ СКРЫТЫХ РАБОТ №5");
    expect(r.doc_class).toBe("prior_aosr");
  });

  it("исполнительная схема → executive_scheme", () => {
    const r = classifyText("Исполнительная схема профиль перехода ЗП5 масштаб 1:500");
    expect(r.doc_class).toBe("executive_scheme");
    expect(r.confidence).toBe("high"); // 3 matches
  });

  it("unrecognized text → unknown", () => {
    const r = classifyText("Привет, как дела?");
    expect(r.doc_class).toBe("unknown");
    expect(r.confidence).toBe("low");
  });
});

describe("classify (combined)", () => {
  it("high-confidence filename wins over text", () => {
    const r = classify("Паспорт качества №13043.pdf", "random text");
    expect(r.doc_class).toBe("passport_pipe");
  });

  it("text refines low-confidence filename", () => {
    const r = classify("document.pdf", "СЕРТИФИКАТ СООТВЕТСТВИЯ №123");
    expect(r.doc_class).toBe("certificate");
  });

  it("filename only", () => {
    const r = classify("Приказ №699.pdf", undefined);
    expect(r.doc_class).toBe("order");
  });

  it("text only", () => {
    const r = classify(undefined, "ПАСПОРТ КАЧЕСТВА №13043");
    expect(r.doc_class).toBe("passport_pipe");
  });

  it("neither → unknown", () => {
    const r = classify(undefined, undefined);
    expect(r.doc_class).toBe("unknown");
  });
});

describe("sourceTypeFromExt", () => {
  it("pdf", () => expect(sourceTypeFromExt("doc.pdf")).toBe("pdf"));
  it("jpg", () => expect(sourceTypeFromExt("photo.jpg")).toBe("photo"));
  it("png", () => expect(sourceTypeFromExt("scan.png")).toBe("photo"));
  it("xlsx", () => expect(sourceTypeFromExt("data.xlsx")).toBe("excel"));
  it("xls", () => expect(sourceTypeFromExt("data.xls")).toBe("excel"));
});
