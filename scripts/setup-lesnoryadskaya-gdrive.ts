/**
 * Creates Леснорядская folder structure in Google Drive under СКМ ГРУПП
 */
import { google } from "googleapis";
import fs from "node:fs";

const creds = JSON.parse(fs.readFileSync("gnb-credentials.json", "utf-8"));
const auth = new google.auth.GoogleAuth({ credentials: creds, scopes: ["https://www.googleapis.com/auth/drive"] });
const drive = google.drive({ version: "v3", auth });

const SKM_FOLDER_ID = "13cQ2cqYMxwM35vhic96ES5eIFg8rPxwt";

async function createFolder(name: string, parentId: string): Promise<string> {
  // Check if already exists
  const existing = await drive.files.list({
    q: `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`,
    fields: "files(id, name)",
  });
  if (existing.data.files?.length) {
    console.log(`  ✓ exists: ${name} [${existing.data.files[0].id}]`);
    return existing.data.files[0].id!;
  }
  const res = await drive.files.create({
    requestBody: { name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] },
    fields: "id",
  });
  console.log(`  + created: ${name} [${res.data.id}]`);
  return res.data.id!;
}

console.log("\n=== Creating Леснорядская structure in GDrive ===\n");

// 1. Леснорядская base folder
const lesnoId = await createFolder("Леснорядская", SKM_FOLDER_ID);

// 2. Общие документы объекта (shared across all transitions)
await createFolder("Документы объекта", lesnoId);
await createFolder("Паспорта трубы (общие)", lesnoId);
await createFolder("Приказы (общие)", lesnoId);

console.log(`\nГотово. Леснорядская folder ID: ${lesnoId}`);
console.log("Transition subfolders (ЗП N) will be created when act is received.");
