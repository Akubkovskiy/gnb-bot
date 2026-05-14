/**
 * Ingest: Леснорядская ЗП №11 — исполнительная схема + протокол бурения
 * Создаёт папки в GDrive, загружает файлы, регистрирует в БД.
 */
import fs from "node:fs";
import path from "node:path";
import { google } from "googleapis";
import { getDb, getRawDb } from "../src/db/client.js";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEMORY_DIR = path.join(__dirname, "../.gnb-memory");

const creds = JSON.parse(fs.readFileSync("gnb-credentials.json", "utf-8"));
const auth = new google.auth.GoogleAuth({ credentials: creds, scopes: ["https://www.googleapis.com/auth/drive"] });
const drive = google.drive({ version: "v3", auth });

const LESNO_FOLDER_ID = "1gm_uMsdDMlkgb1nqNcw3qlYNexl5Nu7T"; // 01. Леснорядская

const FILES = [
  {
    localPath: "C:\\Users\\kubko\\Downloads\\Telegram Desktop\\Леснорядская ГНБ №11.dwg",
    docType: "executive_scheme",
    gdriveFolderName: "05. Исполнительные схемы",
  },
  {
    localPath: "C:\\Users\\kubko\\Downloads\\Telegram Desktop\\Леснрядская ПБ ГНБ №11.xlsx",
    docType: "prior_aosr",   // протокол бурения → исполнительная документация
    gdriveFolderName: "01. Исполнительная документация",
  },
];

// ── GDrive helpers ──────────────────────────────────────────────────────────

async function ensureFolder(name: string, parentId: string): Promise<string> {
  const ex = await drive.files.list({
    q: `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`,
    fields: "files(id)",
  });
  if (ex.data.files?.length) return ex.data.files[0].id!;
  const r = await drive.files.create({
    requestBody: { name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] },
    fields: "id",
  });
  console.log(`  📁 создана: ${name}`);
  return r.data.id!;
}

async function uploadFile(localPath: string, folderId: string): Promise<{ id: string; name: string }> {
  const name = path.basename(localPath);
  const ext = path.extname(name).toLowerCase();
  const mimeMap: Record<string, string> = {
    ".dwg": "application/acad",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".xls": "application/vnd.ms-excel",
    ".pdf": "application/pdf",
  };
  const mimeType = mimeMap[ext] ?? "application/octet-stream";

  // Check if already uploaded
  const ex = await drive.files.list({
    q: `name='${name}' and '${folderId}' in parents and trashed=false`,
    fields: "files(id, name)",
  });
  if (ex.data.files?.length) {
    console.log(`  ⚡ уже есть: ${name} [${ex.data.files[0].id}]`);
    return { id: ex.data.files[0].id!, name };
  }

  const res = await drive.files.create({
    requestBody: { name, parents: [folderId] },
    media: { mimeType, body: fs.createReadStream(localPath) },
    fields: "id",
  });
  console.log(`  ✓ загружено: ${name} [${res.data.id}]`);
  return { id: res.data.id!, name };
}

// ── Main ────────────────────────────────────────────────────────────────────

console.log("\n=== Леснорядская ЗП №11 — ingest ===\n");

// 1. Создать ЗП 11 в GDrive (как 04. ЗП 11)
console.log("GDrive: создаём папки...");
const zp11Id = await ensureFolder("04. ЗП 11", LESNO_FOLDER_ID);
const subFolderIds: Record<string, string> = {};
for (const name of [
  "01. Исполнительная документация",
  "02. Паспорта на трубу",
  "03. Сертификаты",
  "04. Приказы и распоряжения",
  "05. Исполнительные схемы",
  "06. Прочее",
]) {
  subFolderIds[name] = await ensureFolder(name, zp11Id);
}

// 2. Загрузить файлы
console.log("\nЗагружаем файлы...");
const uploaded: Array<{ file: typeof FILES[0]; driveId: string; driveName: string }> = [];
for (const f of FILES) {
  if (!fs.existsSync(f.localPath)) {
    console.log(`  ✗ не найден: ${f.localPath}`);
    continue;
  }
  const folderId = subFolderIds[f.gdriveFolderName];
  const result = await uploadFile(f.localPath, folderId);
  uploaded.push({ file: f, driveId: result.id, driveName: result.name });
}

// 3. БД — создать черновик перехода и зарегистрировать документы
console.log("\nБД...");
getDb(MEMORY_DIR);
const db = getRawDb()!;

// Upsert transition (draft)
const existingTrans = db.prepare("SELECT id FROM transitions WHERE id = 'trans-lesnoryadskaya-11'").get();
if (!existingTrans) {
  db.prepare(`
    INSERT INTO transitions (id, object_id, gnb_number, gnb_number_short, status, object_name, created_at, updated_at)
    VALUES ('trans-lesnoryadskaya-11', 'obj-lesnoryadskaya', 'ГНБ №11', '11', 'draft', 'Леснорядская', datetime('now'), datetime('now'))
  `).run();
  console.log("  ✓ переход trans-lesnoryadskaya-11 создан (draft)");
} else {
  console.log("  ✓ переход уже существует");
}

// Register documents
for (const u of uploaded) {
  const docId = `doc_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  db.prepare(`
    INSERT OR IGNORE INTO documents (id, doc_type, original_filename, gdrive_file_id, status, origin, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'stored', 'gdrive_upload', datetime('now'), datetime('now'))
  `).run(docId, u.file.docType, u.driveName, u.driveId);

  db.prepare(`
    INSERT INTO document_links (document_id, link_type, target_id, relation, created_at)
    VALUES (?, 'transition', 'trans-lesnoryadskaya-11', ?, datetime('now'))
  `).run(docId, u.file.docType);

  console.log(`  ✓ зарегистрирован: ${u.driveName} (${u.file.docType})`);
}

// 4. Summary
console.log(`
✅ Итог:
   GDrive: gnb_bot / 01. Леснорядская / 04. ЗП 11
   Загружено: ${uploaded.length} файлов
   БД: переход trans-lesnoryadskaya-11 (draft), ${uploaded.length} документа

⏳ Для финализации нужен акт МКС АОСР+РЭР:
   → заполнит даты, трубу, адрес, подписантов
`);
