/**
 * Storage placement module — places documents into the canonical
 * transition folder structure.
 *
 * Layout:
 *   [WorkRoot]/[Customer]/[Object]/ЗП [number]/
 *     ├── Исполнительная документация/
 *     ├── Паспорта на трубу/
 *     ├── Сертификаты/
 *     ├── Приказы и распоряжения/
 *     ├── Исполнительные схемы/
 *     └── Прочее/
 */

import fs from "node:fs";
import path from "node:path";
import { getWorkRoot, getProjectDir } from "../utils/paths.js";
import { logger } from "../logger.js";

// === Types ===

export interface TransitionStoragePlan {
  transitionDir: string;
  execDocsDir: string;
  pipePassportsDir: string;
  certificatesDir: string;
  ordersDir: string;
  schemesDir: string;
  miscDir: string;
}

export interface PlacementRecord {
  docType: string;
  sourceFile: string;
  targetFile: string;
  targetDir: string;
  success: boolean;
  error?: string;
}

export interface PlacementReport {
  transitionDir: string;
  placements: PlacementRecord[];
  totalPlaced: number;
  totalFailed: number;
}

// === Doc type → dir mapping ===

type DirKey = keyof Omit<TransitionStoragePlan, "transitionDir">;

const DOC_TYPE_DIR_MAP: Record<string, DirKey> = {
  // Executive docs
  prior_aosr: "execDocsDir",
  prior_internal_act: "execDocsDir",
  summary_excel: "execDocsDir",
  generated_internal_acts: "execDocsDir",
  generated_aosr: "execDocsDir",

  // Schemes
  executive_scheme: "schemesDir",

  // Pipe passports
  pipe_passport: "pipePassportsDir",
  passport_pipe: "pipePassportsDir",

  // Certificates
  certificate: "certificatesDir",
  pipe_certificate: "certificatesDir",

  // Orders
  order: "ordersDir",
  order_sign1: "ordersDir",
  order_sign2: "ordersDir",
  order_sign3: "ordersDir",
  order_tech: "ordersDir",
  appointment_letter: "ordersDir",
};

// === Plan builder ===

/**
 * Build a storage plan with full paths for a given transition.
 */
export function buildStoragePlan(
  customer: string,
  object: string,
  gnbNumberShort: string,
): TransitionStoragePlan {
  const projectDir = getProjectDir(customer, object);
  const transitionDir = path.join(projectDir, `ЗП ${gnbNumberShort}`);

  return {
    transitionDir,
    execDocsDir:      path.join(transitionDir, "01. Исполнительная документация"),
    pipePassportsDir: path.join(transitionDir, "02. Паспорта на трубу"),
    certificatesDir:  path.join(transitionDir, "03. Сертификаты"),
    ordersDir:        path.join(transitionDir, "04. Приказы и распоряжения"),
    schemesDir:       path.join(transitionDir, "05. Исполнительные схемы"),
    miscDir:          path.join(transitionDir, "06. Прочее"),
  };
}

/**
 * Create all directories in the storage plan.
 */
export function ensureStorageDirs(plan: TransitionStoragePlan): void {
  const dirs = [
    plan.transitionDir,
    plan.execDocsDir,
    plan.pipePassportsDir,
    plan.certificatesDir,
    plan.ordersDir,
    plan.schemesDir,
    plan.miscDir,
  ];

  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Get the target directory for a document type.
 * Returns the full path from the plan.
 */
export function getTargetDir(
  plan: TransitionStoragePlan,
  docType: string,
): string {
  const dirKey = DOC_TYPE_DIR_MAP[docType];
  if (dirKey) {
    return plan[dirKey];
  }
  return plan.miscDir;
}

/**
 * Place a document file into the correct subdirectory.
 * Copies the file (does not move).
 *
 * @param plan - storage plan
 * @param docType - document type for routing
 * @param sourceFilePath - path to the source file
 * @param targetFileName - optional override for the target file name
 * @returns placement record
 */
export function placeDocument(
  plan: TransitionStoragePlan,
  docType: string,
  sourceFilePath: string,
  targetFileName?: string,
): PlacementRecord {
  const targetDir = getTargetDir(plan, docType);
  const fileName = targetFileName || path.basename(sourceFilePath);
  const targetFile = path.join(targetDir, fileName);

  try {
    fs.mkdirSync(targetDir, { recursive: true });
    fs.copyFileSync(sourceFilePath, targetFile);

    logger.info({ docType, targetFile }, "Document placed");

    return {
      docType,
      sourceFile: sourceFilePath,
      targetFile,
      targetDir,
      success: true,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "unknown error";
    logger.error({ err, docType, sourceFilePath, targetFile }, "Failed to place document");

    return {
      docType,
      sourceFile: sourceFilePath,
      targetFile,
      targetDir,
      success: false,
      error: errorMsg,
    };
  }
}

/**
 * Build a human-readable placement report.
 */
export function buildPlacementReport(placements: PlacementRecord[]): PlacementReport & { text: string } {
  const totalPlaced = placements.filter((p) => p.success).length;
  const totalFailed = placements.filter((p) => !p.success).length;

  const lines: string[] = [];

  if (totalPlaced > 0) {
    lines.push(`\uD83D\uDCC1 Размещено документов: ${totalPlaced}`);
    for (const p of placements.filter((p) => p.success)) {
      const dirName = path.basename(p.targetDir);
      const fileName = path.basename(p.targetFile);
      lines.push(`  ${fileName} \u2192 ${dirName}/`);
    }
  }

  if (totalFailed > 0) {
    lines.push(`\u26A0\uFE0F Не удалось разместить: ${totalFailed}`);
    for (const p of placements.filter((p) => !p.success)) {
      lines.push(`  ${path.basename(p.sourceFile)}: ${p.error}`);
    }
  }

  if (placements.length === 0) {
    lines.push("Нет документов для размещения.");
  }

  const transitionDir = placements.length > 0
    ? path.dirname(placements[0].targetDir)
    : "";

  return {
    transitionDir,
    placements,
    totalPlaced,
    totalFailed,
    text: lines.join("\n"),
  };
}

/**
 * Place multiple documents from an intake draft's sources into storage.
 * Returns a placement report.
 */
export function placeIntakeDocuments(
  plan: TransitionStoragePlan,
  sources: Array<{
    docType: string;
    filePath: string;
    targetFileName?: string;
  }>,
): PlacementReport & { text: string } {
  ensureStorageDirs(plan);

  const placements: PlacementRecord[] = [];
  for (const source of sources) {
    if (!source.filePath || !fs.existsSync(source.filePath)) {
      placements.push({
        docType: source.docType,
        sourceFile: source.filePath || "",
        targetFile: "",
        targetDir: getTargetDir(plan, source.docType),
        success: false,
        error: "Файл не найден",
      });
      continue;
    }

    const record = placeDocument(plan, source.docType, source.filePath, source.targetFileName);
    placements.push(record);
  }

  return buildPlacementReport(placements);
}
