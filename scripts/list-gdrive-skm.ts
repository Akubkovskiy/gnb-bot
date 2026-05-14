import { google } from "googleapis";
import fs from "node:fs";

const creds = JSON.parse(fs.readFileSync("gnb-credentials.json", "utf-8"));
const auth = new google.auth.GoogleAuth({ credentials: creds, scopes: ["https://www.googleapis.com/auth/drive"] });
const drive = google.drive({ version: "v3", auth });

async function listRecursive(folderId: string, prefix = "", depth = 0): Promise<void> {
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed=false`,
    fields: "files(id, name, mimeType, size)",
    pageSize: 100,
    orderBy: "name",
  });
  for (const f of res.data.files ?? []) {
    const indent = "  ".repeat(depth);
    const isFolder = f.mimeType === "application/vnd.google-apps.folder";
    const size = f.size ? ` (${Math.round(Number(f.size)/1024)}kb)` : "";
    console.log(`${indent}${isFolder ? "📁" : "📄"} ${f.name}${size}  [${f.id}]`);
    if (isFolder) await listRecursive(f.id!, prefix + f.name + "/", depth + 1);
  }
}

// Find СКМ folder
const root = await drive.files.list({
  q: `'1OhJ1HRWm3-4pQke3KeBcbsI6fdWaFR0c' in parents and trashed=false`,
  fields: "files(id, name, mimeType)",
});

const skm = root.data.files?.find(f => f.name?.includes("СКМ") || f.name?.includes("скм") || f.name?.includes("skm") || f.name?.includes("SKM"));
if (skm) {
  console.log(`\n=== ${skm.name} [${skm.id}] ===\n`);
  await listRecursive(skm.id!);
} else {
  console.log("СКМ folder not found. All top-level folders:");
  root.data.files?.forEach(f => console.log(`  ${f.name} [${f.id}]`));
}
