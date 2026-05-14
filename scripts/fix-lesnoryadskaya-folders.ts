/**
 * Fix Леснорядская GDrive subfolder names:
 * - Rename ЗП 11 subfolders to updated naming (Паспорта, Приказы)
 * - Remove "Документы объекта" (merge into object root)
 * - Remove "(общие)" suffix
 */
import { google } from "googleapis";
import fs from "node:fs";

const creds = JSON.parse(fs.readFileSync("gnb-credentials.json", "utf-8"));
const auth = new google.auth.GoogleAuth({ credentials: creds, scopes: ["https://www.googleapis.com/auth/drive"] });
const drive = google.drive({ version: "v3", auth });

const LESNO_FOLDER_ID = "1gm_uMsdDMlkgb1nqNcw3qlYNexl5Nu7T";

async function listChildren(parentId: string) {
  const r = await drive.files.list({
    q: `'${parentId}' in parents and trashed=false`,
    fields: "files(id, name, mimeType)",
    orderBy: "name",
  });
  return r.data.files ?? [];
}

async function rename(id: string, newName: string) {
  await drive.files.update({ fileId: id, requestBody: { name: newName } });
  console.log(`  ✓ → ${newName}`);
}

async function deleteFolder(id: string, name: string) {
  await drive.files.delete({ fileId: id });
  console.log(`  🗑 удалена: ${name}`);
}

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
  console.log(`  + создана: ${name}`);
  return r.data.id!;
}

console.log("\n=== Обновление папок Леснорядской ===\n");

// Fix object-level folders
console.log("Корень объекта:");
const rootChildren = await listChildren(LESNO_FOLDER_ID);
for (const f of rootChildren) {
  if (f.name === "01. Документы объекта") {
    await deleteFolder(f.id!, f.name!);  // убираем — непонятная категория
  } else if (f.name === "02. Паспорта трубы (общие)") {
    await rename(f.id!, "02. Паспорта");
  } else if (f.name === "03. Приказы (общие)") {
    await rename(f.id!, "03. Приказы");
  }
}
// Renumber: теперь будет 01. Паспорта, 02. Приказы
// Найдём и перенумеруем
const afterRoot = await listChildren(LESNO_FOLDER_ID);
for (const f of afterRoot) {
  if (f.name === "02. Паспорта") await rename(f.id!, "01. Паспорта");
  else if (f.name === "03. Приказы") await rename(f.id!, "02. Приказы");
}

// Fix ЗП 11 subfolders
console.log("\nЗП 11 подпапки:");
const zp11 = afterRoot.find(f => f.name === "04. ЗП 11");
if (zp11) {
  const zpChildren = await listChildren(zp11.id!);
  const renames: Record<string, string> = {
    "02. Паспорта на трубу": "02. Паспорта",
    "04. Приказы и распоряжения": "04. Приказы",
  };
  for (const f of zpChildren) {
    if (renames[f.name!]) await rename(f.id!, renames[f.name!]);
  }
} else {
  console.log("  ⚠ ЗП 11 не найдена, пересоздаём...");
  const zp11Id = await ensureFolder("04. ЗП 11", LESNO_FOLDER_ID);  // shifted after root cleanup
  for (const n of ["01. Исполнительная документация","02. Паспорта","03. Сертификаты","04. Приказы","05. Исполнительные схемы","06. Прочее"]) {
    await ensureFolder(n, zp11Id);
  }
}

// Final view
console.log("\n✅ Итоговая структура:");
const final = await listChildren(LESNO_FOLDER_ID);
for (const f of final.sort((a,b) => (a.name!).localeCompare(b.name!))) {
  console.log(`  📁 ${f.name}`);
  if (f.name?.includes("ЗП")) {
    const subs = await listChildren(f.id!);
    for (const s of subs.sort((a,b) => (a.name!).localeCompare(b.name!))) {
      console.log(`       📁 ${s.name}`);
    }
  }
}
