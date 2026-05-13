/**
 * gdrive-sync.ts — one-way push to Google Drive after local storage.
 * Service account auth. Never used for retrieval.
 *
 * Env: GDRIVE_FOLDER_ID — root folder in Drive (e.g. GNB-bot/)
 * Credentials: read from process.env.GDRIVE_CREDENTIALS_PATH or default gnb-credentials.json
 */

import fs from "node:fs";
import path from "node:path";
import { google } from "googleapis";
import { logger } from "../logger.js";
import { getDb } from "../db/client.js";
import { createRepos } from "../db/repositories.js";

type Db = ReturnType<typeof getDb>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get or create a folder in Google Drive by name under a given parent.
 * Returns the folder id.
 */
async function getOrCreateDriveFolder(
  drive: ReturnType<typeof google.drive>,
  parentFolderId: string,
  folderName: string,
): Promise<string> {
  // Search for existing folder
  const res = await drive.files.list({
    q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and '${parentFolderId}' in parents and trashed=false`,
    fields: "files(id, name)",
    spaces: "drive",
  });

  const files = res.data.files ?? [];
  if (files.length > 0 && files[0].id) {
    return files[0].id;
  }

  // Create folder
  const created = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentFolderId],
    },
    fields: "id",
  });

  if (!created.data.id) {
    throw new Error(`Failed to create GDrive folder: ${folderName}`);
  }
  return created.data.id;
}

/**
 * Ensure a folder hierarchy exists in Drive and return the leaf folder id.
 * folderPath is like "transitions/trans-saltykova-1/acts"
 */
async function ensureDriveFolderPath(
  drive: ReturnType<typeof google.drive>,
  rootFolderId: string,
  folderPath: string,
): Promise<string> {
  const parts = folderPath.split("/").filter(Boolean);
  let currentId = rootFolderId;
  for (const part of parts) {
    currentId = await getOrCreateDriveFolder(drive, currentId, part);
  }
  return currentId;
}

/**
 * Build a sensible Drive folder path from link context.
 */
export function buildDriveFolderPath(linkType?: string, targetId?: string): string {
  if (linkType && targetId) {
    return `${linkType}s/${targetId}`;
  }
  return "inbox";
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Upload a local file to Google Drive and update the DB record.
 * Non-blocking by design: errors are logged, never rethrown.
 */
export async function syncDocumentToDrive(
  db: Db,
  documentId: string,
  localPath: string,
  originalFilename: string,
  folderPath: string,
): Promise<void> {
  const rootFolderId = process.env.GDRIVE_FOLDER_ID;
  if (!rootFolderId) {
    logger.warn("GDRIVE_FOLDER_ID not set, skipping GDrive sync");
    return;
  }

  const credentialsPath =
    process.env.GDRIVE_CREDENTIALS_PATH ?? path.join(process.cwd(), "gnb-credentials.json");

  if (!fs.existsSync(credentialsPath)) {
    logger.warn({ credentialsPath }, "GDrive credentials file not found, skipping sync");
    return;
  }

  try {
    const credentials = JSON.parse(fs.readFileSync(credentialsPath, "utf-8"));

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/drive"],
    });

    const drive = google.drive({ version: "v3", auth });

    // Ensure folder path exists
    const leafFolderId = await ensureDriveFolderPath(drive, rootFolderId, folderPath);

    // Upload file
    const mimeType = guessMimeType(originalFilename);
    const response = await drive.files.create({
      requestBody: {
        name: originalFilename,
        parents: [leafFolderId],
      },
      media: {
        mimeType,
        body: fs.createReadStream(localPath),
      },
      fields: "id",
    });

    const gdriveFileId = response.data.id;
    if (!gdriveFileId) {
      logger.warn({ documentId }, "GDrive upload returned no file id");
      return;
    }

    // Update DB record
    const repos = createRepos(db);
    repos.documents.updateGdriveInfo(documentId, gdriveFileId);

    logger.info({ documentId, gdriveFileId, folderPath }, "Document synced to GDrive");
  } catch (err) {
    // Non-blocking: log and continue
    logger.warn({ err, documentId, localPath }, "GDrive sync failed (non-fatal)");
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function guessMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const map: Record<string, string> = {
    ".pdf": "application/pdf",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".xls": "application/vnd.ms-excel",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".doc": "application/msword",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
  };
  return map[ext] ?? "application/octet-stream";
}
