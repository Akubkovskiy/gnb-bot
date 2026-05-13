/**
 * Full test: actualization + KB queries for Бабушкина ГНБ 1-1.
 * Run: npx tsx scripts/test-babushkina-full.ts
 */

import { getDb } from "../src/db/client.js";
import { parseMksAct } from "../src/intake/mks-act-parser.js";
import { actualizeMksAct } from "../src/services/mks-actualizer.js";
import { buildKbContext } from "../src/services/kb-query.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEMORY_DIR = path.join(__dirname, "../.gnb-memory");
const ACT_FILE = path.join(__dirname, "../1. Letchika Babushkina/МКС АОСР+РЭР ЗП 1-1.xlsx");

async function main() {
  const db = getDb(MEMORY_DIR);

  // -----------------------------------------------------------------------
  // Step 1: Actualization
  // -----------------------------------------------------------------------
  console.log("\n========================================");
  console.log("  ACTUALIZATION TEST");
  console.log("========================================");

  const act = parseMksAct(ACT_FILE);
  const result = await actualizeMksAct(db, act);

  console.log("\n--- Summary ---");
  console.log(result.summary);

  console.log("\n--- Findings count ---");
  console.log(`Total: ${result.findings.length} (warnings: ${result.findings.filter(f => f.warning).length})`);

  // -----------------------------------------------------------------------
  // Step 2: KB queries
  // -----------------------------------------------------------------------
  console.log("\n========================================");
  console.log("  KB QUERY TESTS");
  console.log("========================================");

  const queries = [
    "что было по ГНБ 1-1 на Бабушкина",
    "кто там был принимающий",
    "скинь паспорт трубы",
    "документы по переходу",
    "кто такой Щеглов",
    "труба электропайп",
  ];

  const CHAT_ID = 99999; // test chat id

  for (const q of queries) {
    console.log(`\n--- Query: "${q}" ---`);
    const ctx = await buildKbContext(db, q, CHAT_ID);
    if (ctx.found) {
      console.log(`found=true, transition=${ctx.activeTransitionId ?? "—"}, person=${ctx.activePersonId ?? "—"}`);
      // Print first 20 lines of context
      const lines = ctx.contextText.split("\n");
      lines.slice(0, 20).forEach(l => console.log(l));
      if (lines.length > 20) console.log(`... [${lines.length - 20} more lines]`);
    } else {
      console.log("found=false — no KB context matched");
    }
  }

  process.exit(0);
}

main().catch(e => {
  console.error("❌ Error:", e.message ?? e);
  process.exit(1);
});
