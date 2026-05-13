/**
 * Smoke test: document-store.ts
 * Run: npx tsx scripts/test-document-store.ts
 */
import { storeDocumentSync } from "../src/storage/document-store.js";
import { getDb } from "../src/db/client.js";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEMORY_DIR = path.join(__dirname, "../.gnb-memory");
const db = getDb(MEMORY_DIR);

// Create a temp test file
const tmpFile = path.join(MEMORY_DIR, "test-act-tmp.xlsx");
fs.writeFileSync(tmpFile, "fake xlsx content");

console.log("Testing storeDocument (no transition context) → inbox...");
const result1 = storeDocumentSync(db, {
  tempFilePath: tmpFile,
  originalFilename: "test-act.xlsx",
  docType: "act",
  notes: "smoke test",
});
console.log("✅ Stored:", result1.storedPath);
console.log("   Document ID:", result1.documentId);

// Verify file exists on disk
if (!fs.existsSync(result1.storedPath)) {
  console.error("❌ File not found on disk:", result1.storedPath);
  process.exit(1);
}
console.log("✅ File exists on disk");

console.log("\nTesting storeDocument with transition link...");
// Reuse the temp file (storeDocumentSync copies, doesn't move)
fs.writeFileSync(tmpFile, "fake xlsx content 2");
const result2 = storeDocumentSync(db, {
  tempFilePath: tmpFile,
  originalFilename: "act-gnb1.xlsx",
  docType: "act",
  linkType: "transition",
  targetId: "trans-saltykova-1",
  relation: "act",
  notes: "smoke test with link",
});
console.log("✅ Stored with link:", result2.storedPath);
console.log("   documentLinkId:", result2.documentLinkId);

// Verify file exists
if (!fs.existsSync(result2.storedPath)) {
  console.error("❌ File not found on disk:", result2.storedPath);
  process.exit(1);
}
console.log("✅ File exists on disk");

// Cleanup temp file
try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }

// Test atomicity: if source file is missing, should throw
const nonExistent = path.join(MEMORY_DIR, "nonexistent.xlsx");
try {
  storeDocumentSync(db, { tempFilePath: nonExistent, originalFilename: "nonexistent.xlsx", docType: "act" });
  console.error("❌ Should have thrown for missing source file");
  process.exit(1);
} catch (e) {
  console.log("✅ Correctly throws for missing source file:", (e as Error).message.slice(0, 60));
}

console.log("\n✅ All smoke tests passed");
process.exit(0);
