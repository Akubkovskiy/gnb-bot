/**
 * Переименовывает папки Леснорядской в GDrive с нумерацией.
 * Также переименовывает саму Леснорядскую если нужно.
 */
import { google } from "googleapis";
import fs from "node:fs";

const creds = JSON.parse(fs.readFileSync("gnb-credentials.json", "utf-8"));
const auth = new google.auth.GoogleAuth({ credentials: creds, scopes: ["https://www.googleapis.com/auth/drive"] });
const drive = google.drive({ version: "v3", auth });

const SKM_FOLDER_ID   = "13cQ2cqYMxwM35vhic96ES5eIFg8rPxwt";
const LESNO_FOLDER_ID = "1gm_uMsdDMlkgb1nqNcw3qlYNexl5Nu7T";

async function rename(fileId: string, newName: string) {
  await drive.files.update({ fileId, requestBody: { name: newName } });
  console.log(`  ✓ → ${newName}`);
}

async function createFolder(name: string, parentId: string): Promise<string> {
  const ex = await drive.files.list({
    q: `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`,
    fields: "files(id)",
  });
  if (ex.data.files?.length) return ex.data.files[0].id!;
  const r = await drive.files.create({
    requestBody: { name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] },
    fields: "id",
  });
  console.log(`  + ${name}`);
  return r.data.id!;
}

console.log("\n=== Нумерация папок ===\n");

// 1. Переименовать Леснорядская → 01. Леснорядская
console.log("Леснорядская:");
await rename(LESNO_FOLDER_ID, "01. Леснорядская");

// 2. Удалить старые ненумерованные подпапки и создать нумерованные
const oldFolders = await drive.files.list({
  q: `'${LESNO_FOLDER_ID}' in parents and trashed=false`,
  fields: "files(id, name)",
});

console.log("\nПересоздаём подпапки с нумерацией:");
// Удаляем старые
for (const f of oldFolders.data.files ?? []) {
  await drive.files.delete({ fileId: f.id! });
  console.log(`  - удалено: ${f.name}`);
}

// Создаём нумерованные общие папки объекта
await createFolder("01. Документы объекта", LESNO_FOLDER_ID);
await createFolder("02. Паспорта трубы (общие)", LESNO_FOLDER_ID);
await createFolder("03. Приказы (общие)", LESNO_FOLDER_ID);
// ЗП-папки будут создаваться как: "04. ЗП 1-1", "05. ЗП 1-2", ...
// внутри каждой ЗП:
// 01. Исполнительная документация
// 02. Паспорта на трубу
// 03. Сертификаты
// 04. Приказы и распоряжения
// 05. Исполнительные схемы
// 06. Прочее

console.log("\n✅ Готово. Структура:\n");
const result = await drive.files.list({
  q: `'${LESNO_FOLDER_ID}' in parents and trashed=false`,
  fields: "files(name)",
  orderBy: "name",
});
for (const f of result.data.files ?? []) console.log(`  📁 ${f.name}`);
