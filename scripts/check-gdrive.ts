import { google } from "googleapis";
import fs from "node:fs";

const creds = JSON.parse(fs.readFileSync("gnb-credentials.json", "utf-8"));
const auth = new google.auth.GoogleAuth({ credentials: creds, scopes: ["https://www.googleapis.com/auth/drive"] });
const drive = google.drive({ version: "v3", auth });

const ROOT = "1OhJ1HRWm3-4pQke3KeBcbsI6fdWaFR0c";

const meta = await drive.files.get({ fileId: ROOT, fields: "id, name, mimeType" });
console.log("Folder:", meta.data);

const res = await drive.files.list({
  q: `'${ROOT}' in parents and trashed=false`,
  fields: "files(id, name, mimeType, size)",
  pageSize: 50,
});
console.log(`Contents (${res.data.files?.length ?? 0} items):`, JSON.stringify(res.data.files, null, 2));
