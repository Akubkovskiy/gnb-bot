/**
 * ingest-from-gdrive.ts
 *
 * Scans the gnb_bot Google Drive folder, identifies document types,
 * downloads files to VPS in the correct directory structure,
 * and updates/inserts DB records with correct file_path + gdrive_file_id.
 *
 * Usage: npx tsx scripts/ingest-from-gdrive.ts [--dry-run]
 */

import fs from "node:fs";
import path from "node:path";
import { google } from "googleapis";
import { getDb } from "../src/db/client.js";
import { createRepos } from "../src/db/repositories.js";
import { buildStoragePlan, ensureStorageDirs, getTargetDir } from "../src/storage/placement.js";
import { buildStorageFileName, extractExtension } from "../src/storage/document-naming.js";
import { getWorkRoot } from "../src/utils/paths.js";
import { logger } from "../src/logger.js";

const DRY_RUN = process.argv.includes("--dry-run");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const ROOT_FOLDER_ID = process.env.GDRIVE_FOLDER_ID!;
const CREDENTIALS_PATH =
  process.env.GDRIVE_CREDENTIALS_PATH ?? path.join(process.cwd(), "gnb-credentials.json");

if (!ROOT_FOLDER_ID) {
  console.error("GDRIVE_FOLDER_ID not set");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// GDrive helpers
// ---------------------------------------------------------------------------

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  parents?: string[];
  webViewLink?: string;
}

async function listAllFiles(
  drive: ReturnType<typeof google.drive>,
  folderId: string,
  prefix = "",
): Promise<Array<DriveFile & { drivePath: string }>> {
  const result: Array<DriveFile & { drivePath: string }> = [];

  let pageToken: string | undefined;
  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: "nextPageToken, files(id, name, mimeType, size, parents)",
      pageSize: 100,
      pageToken,
    });
    pageToken = res.data.nextPageToken ?? undefined;
    for (const f of res.data.files ?? []) {
      const filePath = prefix ? `${prefix}/${f.name}` : f.name!;
      if (f.mimeType === "application/vnd.google-apps.folder") {
        // Recurse into subfolder
        const children = await listAllFiles(drive, f.id!, filePath);
        result.push(...children);
      } else {
        result.push({ ...(f as DriveFile), drivePath: filePath });
      }
    }
  } while (pageToken);

  return result;
}

async function downloadFile(
  drive: ReturnType<typeof google.drive>,
  fileId: string,
  destPath: string,
): Promise<void> {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const dest = fs.createWriteStream(destPath);
  const res = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "stream" },
  );
  await new Promise<void>((resolve, reject) => {
    (res.data as NodeJS.ReadableStream)
      .pipe(dest)
      .on("finish", resolve)
      .on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// Document type detection
// ---------------------------------------------------------------------------

interface DocClassification {
  docType: string;
  // transition context hints parsed from path / filename
  customerHint?: string;
  objectHint?: string;
  gnbHint?: string;
}

const TYPE_PATTERNS: Array<{ pattern: RegExp; docType: string }> = [
  { pattern: /аоср|аокс|рэр|акт\s*(скрытых|освидетель)/i, docType: "prior_aosr" },
  { pattern: /паспорт.*труб|труб.*паспорт|сертификат.*соответств/i, docType: "passport_pipe" },
  { pattern: /исполнит.*схем|схем.*гнб|ис\s*гнб/i, docType: "executive_scheme" },
  { pattern: /паспорт.*объект|объект.*паспорт/i, docType: "passport_object" },
  { pattern: /приказ/i, docType: "order" },
  { pattern: /иннс|инрс|инр|нарс|назначени/i, docType: "inrs" },
  { pattern: /сертификат/i, docType: "certificate" },
  { pattern: /договор/i, docType: "contract" },
  { pattern: /протокол/i, docType: "protocol" },
];

function classifyFile(drivePath: string): DocClassification {
  const lower = drivePath.toLowerCase();
  const filename = path.basename(drivePath).toLowerCase();

  // Try to detect docType from filename
  let docType = "other";
  for (const { pattern, docType: dt } of TYPE_PATTERNS) {
    if (pattern.test(filename) || pattern.test(drivePath)) {
      docType = dt;
      break;
    }
  }

  // Parse object/customer/gnb hints from folder path
  // e.g. "Работа/МКС/Летчика Бабушкина/ЗП 1-1/..."
  const parts = drivePath.split("/");
  let customerHint: string | undefined;
  let objectHint: string | undefined;
  let gnbHint: string | undefined;

  // Heuristic: path structure is usually Работа/<Customer>/<Object>/<GNB>/<...>/<file>
  // or <Customer>/<Object>/<GNB>/...
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (/^зп|^гнб\s*\d|^\d+-\d+/i.test(p)) {
      gnbHint = p.replace(/^зп\s*/i, "").trim();
      if (i > 0) objectHint = parts[i - 1];
      if (i > 1) customerHint = parts[i - 2];
    }
  }

  // Fallback: if path contains "Работа", skip that segment
  const workIdx = parts.findIndex((p) => /^работа$/i.test(p));
  if (workIdx >= 0 && !customerHint) {
    customerHint = parts[workIdx + 1];
    objectHint = parts[workIdx + 2];
  }

  return { docType, customerHint, objectHint, gnbHint };
}

// ---------------------------------------------------------------------------
// DB matching
// ---------------------------------------------------------------------------

function findTransitionInDb(
  repos: ReturnType<typeof createRepos>,
  customerHint?: string,
  objectHint?: string,
  gnbHint?: string,
) {
  if (!customerHint && !objectHint && !gnbHint) return null;
  const all = repos.transitions.listAll();
  for (const t of all) {
    const nameMatch = objectHint && t.object_name?.toLowerCase().includes(objectHint.toLowerCase());
    const gnbMatch = gnbHint && t.gnb_number_short?.toLowerCase().includes(gnbHint.toLowerCase());
    if (nameMatch || gnbMatch) return t;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Resolve destination path on VPS
// ---------------------------------------------------------------------------

function resolveVpsDestination(
  file: { name: string },
  classification: DocClassification,
  transition: { customer_name?: string; object_name?: string; gnb_number_short?: string } | null,
): string {
  const { docType } = classification;

  if (transition?.customer_name && transition.object_name && transition.gnb_number_short) {
    const plan = buildStoragePlan(
      transition.customer_name,
      transition.object_name,
      transition.gnb_number_short,
    );
    ensureStorageDirs(plan);
    const dir = getTargetDir(plan, docType);
    const ext = extractExtension(file.name);
    const canonicalName = buildStorageFileName(docType, {
      originalExt: ext,
      gnbNumberShort: transition.gnb_number_short,
    });
    // collision handling
    let dest = path.join(dir, canonicalName);
    let counter = 2;
    while (fs.existsSync(dest)) {
      const base = path.basename(canonicalName, ext);
      dest = path.join(dir, `${base}_${counter}${ext}`);
      counter++;
    }
    return dest;
  }

  // fallback: inbox/<date>/<filename>
  const dateStr = new Date().toISOString().slice(0, 10);
  const dir = path.join(getWorkRoot(), "inbox", dateStr);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, file.name);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`\n=== GDrive → VPS ingest ${DRY_RUN ? "(DRY RUN)" : ""} ===\n`);

  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf-8"));
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  const drive = google.drive({ version: "v3", auth });

  console.log("📂 Listing all files in GDrive root folder...");
  const files = await listAllFiles(drive, ROOT_FOLDER_ID);
  console.log(`   Found: ${files.length} files\n`);

  const db = getDb();
  const repos = createRepos(db);

  let processed = 0;
  let skipped = 0;
  let errors = 0;
  const report: string[] = [];

  for (const file of files) {
    const classification = classifyFile(file.drivePath);
    const transition = findTransitionInDb(
      repos,
      classification.customerHint,
      classification.objectHint,
      classification.gnbHint,
    );

    const destPath = resolveVpsDestination(file, classification, transition);
    const alreadyExists = fs.existsSync(destPath);

    const line = `  [${classification.docType}] ${file.drivePath}\n    → ${destPath}${transition ? ` (transition: ${transition.gnb_number_short})` : " (inbox)"}${alreadyExists ? " ⚡ exists" : ""}`;
    console.log(line);
    report.push(line);

    if (alreadyExists) {
      skipped++;
      continue;
    }

    if (DRY_RUN) {
      processed++;
      continue;
    }

    try {
      // Download file
      await downloadFile(drive, file.id, destPath);

      // Insert/update DB record
      db.transaction((tx) => {
        const txRepos = createRepos(tx as typeof db);
        // Check if document already exists by gdrive_file_id
        const existing = txRepos.documents.findByGdriveId?.(file.id);
        if (existing) {
          txRepos.documents.updateFilePath(existing.id, destPath);
          txRepos.documents.updateGdriveInfo(existing.id, file.id);
        } else {
          const docId = `doc_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
          txRepos.documents.insert({
            id: docId,
            doc_type: classification.docType,
            original_filename: file.name,
            file_path: destPath,
            status: "stored",
            origin: "gdrive_ingest",
          });
          txRepos.documents.updateGdriveInfo(docId, file.id);
          // Link to transition if found
          if (transition) {
            txRepos.documentLinks.insert({
              document_id: docId,
              link_type: "transition",
              target_id: transition.id,
              relation: classification.docType,
            });
          }
        }
      });

      processed++;
      console.log(`    ✓ downloaded + registered`);
    } catch (err) {
      errors++;
      console.error(`    ✗ ERROR: ${err}`);
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`  Processed: ${processed}`);
  console.log(`  Skipped (exists): ${skipped}`);
  console.log(`  Errors: ${errors}`);

  if (DRY_RUN) {
    console.log(`\n⚠  DRY RUN — no files were downloaded, no DB changes made.`);
    console.log(`   Re-run without --dry-run to apply.`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
