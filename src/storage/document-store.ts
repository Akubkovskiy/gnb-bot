/**
 * document-store.ts — canonical single pipeline for document storage.
 *
 * Operating principle #2: all file writes go through storeDocument() /
 * storeDocumentSync().
 * Atomicity: fs.copyFileSync() then db.transaction(); fs.unlinkSync() on rollback.
 */

import fs from "node:fs";
import path from "node:path";
import { logger } from "../logger.js";
import { getDb } from "../db/client.js";
import { createRepos } from "../db/repositories.js";
import { buildStoragePlan, ensureStorageDirs, getTargetDir } from "./placement.js";
import { buildStorageFileName, extractExtension } from "./document-naming.js";
import { getWorkRoot, getProjectDir } from "../utils/paths.js";

type Db = ReturnType<typeof getDb>;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StoreDocumentInput {
  /** Temp file path (will be copied to permanent location, NOT deleted here). */
  tempFilePath: string;
  originalFilename: string;
  docType?: string; // 'act' | 'passport_pipe' | 'certificate' | 'order' | 'inrs' | 'other'
  /** If provided, UPDATE existing doc row instead of INSERT. */
  documentId?: string;
  /** Polymorphic link */
  linkType?: string; // 'transition' | 'person' | 'org' | 'object' | 'material'
  targetId?: string;
  relation?: string;
  /** For path building (needed for transition-scoped docs) */
  customerName?: string;
  objectName?: string;
  gnbNumberShort?: string;
  /** Metadata for canonical naming */
  docNumber?: string;
  docDate?: string;
  mark?: string;
  /** For person_documents routing */
  personDocId?: number;
  notes?: string;
}

export interface StoreDocumentResult {
  documentId: string;
  storedPath: string; // absolute path on disk
  documentLinkId?: number;
}

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

function generateDocId(): string {
  return `doc_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

function getMiscDir(): string {
  return path.join(getWorkRoot(), "inbox");
}

/**
 * Resolve the destination path, handling collisions by appending _2, _3, etc.
 */
function resolveDestPath(dir: string, filename: string): string {
  fs.mkdirSync(dir, { recursive: true });
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  let candidate = path.join(dir, filename);
  let counter = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${base}_${counter}${ext}`);
    counter++;
  }
  return candidate;
}

/**
 * Determine the destination directory and canonical filename for the input.
 */
function resolveDestination(input: StoreDocumentInput): { dir: string; filename: string } {
  const { customerName, objectName, gnbNumberShort, docType = "other", originalFilename } = input;

  // Full transition context available
  if (customerName && objectName && gnbNumberShort) {
    const plan = buildStoragePlan(customerName, objectName, gnbNumberShort);
    ensureStorageDirs(plan);
    const dir = getTargetDir(plan, docType);
    const ext = extractExtension(originalFilename);
    const canonicalName = buildStorageFileName(docType, {
      docNumber: input.docNumber,
      docDate: input.docDate,
      mark: input.mark,
      gnbNumberShort,
      originalExt: ext,
    });
    return { dir, filename: canonicalName };
  }

  // Object context only (no transition)
  if (customerName && objectName) {
    const dir = path.join(getProjectDir(customerName, objectName), "Прочее");
    return { dir, filename: originalFilename };
  }

  // No context — inbox fallback
  const dateStr = new Date().toISOString().slice(0, 10);
  const dir = path.join(getMiscDir(), dateStr);
  return { dir, filename: originalFilename };
}

// ---------------------------------------------------------------------------
// Sync implementation
// ---------------------------------------------------------------------------

/**
 * Canonical document storage pipeline — synchronous version.
 *
 * Copies the file to the resolved location then wraps all DB mutations in a
 * single transaction. On DB failure the copied file is removed.
 */
export function storeDocumentSync(db: Db, input: StoreDocumentInput): StoreDocumentResult {
  const { tempFilePath, originalFilename, docType = "other" } = input;

  // --- Person document routing ---
  const isPersonDoc =
    input.personDocId !== undefined &&
    (docType === "inrs" || docType === "order" || docType === "passport_person");

  if (isPersonDoc && input.personDocId !== undefined) {
    const personDocId = input.personDocId;
    const dir = path.join(getWorkRoot(), "people");
    const destPath = resolveDestPath(dir, originalFilename);
    fs.copyFileSync(tempFilePath, destPath);
    try {
      const repos = createRepos(db);
      repos.personDocs.updateFilePath(personDocId, destPath);
    } catch (err) {
      try { fs.unlinkSync(destPath); } catch { /* ignore */ }
      throw err;
    }
    return { documentId: String(personDocId), storedPath: destPath };
  }

  // --- Standard document routing ---
  const { dir, filename } = resolveDestination(input);
  const destPath = resolveDestPath(dir, filename);

  // Copy file first
  fs.copyFileSync(tempFilePath, destPath);

  // DB transaction
  let documentLinkId: number | undefined;
  let resolvedDocumentId: string | undefined = input.documentId;
  try {
    db.transaction((tx) => {
      const repos = createRepos(tx as Db);
      let documentId = input.documentId;

      if (documentId) {
        // UPDATE existing document row
        repos.documents.updateFilePath(documentId, destPath);
      } else {
        // INSERT new document row
        documentId = generateDocId();
        repos.documents.insert({
          id: documentId,
          doc_type: docType,
          original_filename: originalFilename,
          file_path: destPath,
          doc_number: input.docNumber,
          doc_date: input.docDate,
          status: "stored",
          origin: "telegram_upload",
          notes: input.notes,
        });
      }

      // Optional document link
      if (input.linkType && input.targetId) {
        const linkResult = repos.documentLinks.insert({
          document_id: documentId!,
          link_type: input.linkType,
          target_id: input.targetId,
          relation: input.relation,
        });
        // better-sqlite3 returns RunResult; lastInsertRowid is the new id
        documentLinkId = Number((linkResult as unknown as { lastInsertRowid: number | bigint }).lastInsertRowid);
      }

      resolvedDocumentId = documentId;
    });
  } catch (err) {
    // Rollback: remove the copied file
    try { fs.unlinkSync(destPath); } catch { /* ignore */ }
    throw err;
  }

  const resolvedId = resolvedDocumentId ?? generateDocId();

  logger.info({ resolvedId, storedPath: destPath, docType }, "Document stored");

  return {
    documentId: resolvedId,
    storedPath: destPath,
    documentLinkId,
  };
}

/**
 * Async version of storeDocumentSync. Same semantics, returns a Promise.
 * After storing, fires GDrive sync in background (non-blocking).
 */
export async function storeDocument(db: Db, input: StoreDocumentInput): Promise<StoreDocumentResult> {
  const result = storeDocumentSync(db, input);

  // Fire-and-forget GDrive sync (non-blocking)
  if (process.env.GDRIVE_FOLDER_ID && result.storedPath) {
    setImmediate(() => {
      import("./gdrive-sync.js").then(({ syncDocumentToDrive }) => {
        const folderPath = buildDriveFolderPathFromInput(input);
        syncDocumentToDrive(db, result.documentId, result.storedPath, input.originalFilename, folderPath)
          .catch((e) => logger.warn({ e }, "GDrive sync background error"));
      }).catch((e) => logger.warn({ e }, "Failed to import gdrive-sync"));
    });
  }

  return result;
}

function buildDriveFolderPathFromInput(input: StoreDocumentInput): string {
  if (input.linkType && input.targetId) {
    return `${input.linkType}s/${input.targetId}/${input.docType ?? "docs"}`;
  }
  return "inbox";
}
