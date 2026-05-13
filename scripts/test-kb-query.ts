/**
 * Smoke test: KB query service
 *
 * Run: npx tsx scripts/test-kb-query.ts
 */
import { buildKbContext } from "../src/services/kb-query.js";
import { getDb } from "../src/db/client.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEMORY_DIR = path.join(__dirname, "../.gnb-memory");

async function main() {
  const db = getDb(MEMORY_DIR);
  const chatId = 999; // fake chatId

  const queries = [
    // Direct transition lookup
    "что было по ГНБ №1 на Салтыковке",
    // Follow-up (no explicit ref — should use prior context)
    "кто там был принимающий",
    // Another follow-up
    "а какие там были материалы",
    // Person lookup
    "кто такой Гусев",
    // Material lookup
    "что знаешь про бентонит",
    // Generic question (no DB ref)
    "какая сегодня погода",
  ];

  for (const q of queries) {
    console.log(`\n${"─".repeat(60)}`);
    console.log(`ВОПРОС: "${q}"`);
    const ctx = await buildKbContext(db, q, chatId);
    if (ctx.found) {
      console.log("КОНТЕКСТ НАЙДЕН:");
      console.log(ctx.contextText.slice(0, 600) + (ctx.contextText.length > 600 ? "\n..." : ""));
      if (ctx.activeTransitionId) console.log(`\n[activeTransition: ${ctx.activeTransitionId}]`);
      if (ctx.activePersonId) console.log(`[activePerson: ${ctx.activePersonId}]`);
    } else {
      console.log("→ Нет релевантных данных в базе (чистый Claude запрос)");
    }
  }
}

main().catch((e) => {
  console.error("❌ Error:", e.message ?? e);
  process.exit(1);
});
