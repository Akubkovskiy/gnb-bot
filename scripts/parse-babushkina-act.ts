/**
 * Parse the Бабушкина MKS act and dump all extracted data.
 * Run: npx tsx scripts/parse-babushkina-act.ts
 */
import { parseMksAct, isMksActFile, serialToDate } from "../src/intake/mks-act-parser.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, "../1. Letchika Babushkina/МКС АОСР+РЭР ЗП 1-1.xlsx");

console.log("File:", FILE);
console.log("isMksActFile:", isMksActFile(FILE));

const act = parseMksAct(FILE);
console.log("\n=== Parsed Act ===");
console.log(JSON.stringify(act, null, 2));

if (act.date_start_serial) {
  console.log("\ndate_start:", serialToDate(act.date_start_serial).toISOString().slice(0, 10));
}
if (act.date_end_serial) {
  console.log("date_end:", serialToDate(act.date_end_serial).toISOString().slice(0, 10));
}
