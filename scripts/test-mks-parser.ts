/**
 * Smoke test: parse the generated Салтыковская file and actualize against DB.
 *
 * Run: npx tsx scripts/test-mks-parser.ts
 */
import { isMksActFile, parseMksAct } from "../src/intake/mks-act-parser.js";
import { actualizeMksAct } from "../src/services/mks-actualizer.js";
import { getDb } from "../src/db/client.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEMORY_DIR = path.join(__dirname, "../.gnb-memory");
const TEST_FILE = path.join(__dirname, "../tmp-mks-saltykova/МКС АОСР+РЭР ЗП 1.xlsx");

async function main() {
  console.log("=== MKS Act Parser smoke test ===\n");

  // Detection
  const detected = isMksActFile(TEST_FILE);
  console.log(`isMksActFile: ${detected ? "✅ YES" : "❌ NO"}`);
  if (!detected) { process.exit(1); }

  // Parse
  const act = parseMksAct(TEST_FILE);
  console.log(`\nobject_title: ${act.object_title.slice(0, 70).trim()}...`);
  console.log(`transition_number: ${act.transition_number}`);
  console.log(`date_start: ${act.date_start_serial} (expect 45957)`);
  console.log(`date_end: ${act.date_end_serial} (expect 45961)`);

  console.log("\n--- Persons ---");
  const roles = [
    ["МКС", act.mks_rep],
    ["Подрядчик-1", act.contractor1],
    ["Подрядчик-2", act.contractor2],
    ["Проектировщик", act.designer_rep],
    ["Исполнитель", act.executor_rep],
    ["РЭР", act.rer_rep],
  ] as const;
  for (const [role, p] of roles) {
    console.log(`  ${role}: ${p.short_name} | inrs: ${p.inrs ?? "-"} | order: ${p.order ?? "-"}`);
  }

  // Actualization against DB
  console.log("\n=== Actualization against DB ===\n");
  const db = getDb(MEMORY_DIR);
  const result = await actualizeMksAct(db, act);

  if (result.findings.length === 0) {
    console.log("✅ No differences found (DB is up to date with this act).");
  } else {
    console.log(`Found ${result.findings.length} finding(s):\n`);
    for (const f of result.findings) {
      console.log(`[${f.kind}] ${f.warning ? "⚠️" : "ℹ️"} ${f.message}`);
    }
  }

  console.log("\n--- Summary ---");
  console.log(result.summary);
}

main().catch((e) => {
  console.error("❌ Error:", e.message ?? e);
  process.exit(1);
});
