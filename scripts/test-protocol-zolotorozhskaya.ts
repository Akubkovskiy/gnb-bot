/**
 * Test: generate drilling protocol from Zolotorozhskaya ГНБ №16 catalog.
 * Compares computed section_length and slope against the original protocol.
 *
 * Run: npx tsx scripts/test-protocol-zolotorozhskaya.ts
 */
import XLSX from "xlsx";
import path from "node:path";
import { parseExcelCatalog } from "../src/parser/coord-catalog.js";
import { calcProtocol } from "../src/calculator/gnb-math.js";
import { renderProtocol } from "../src/renderer/protocol.js";

const CATALOG  = "C:/Users/kubko/YandexDisk/Работа/1.СКМ ГРУПП/Золоторожская/каталог гнб 16.xlsx";
const ORIGINAL = "C:/Users/kubko/YandexDisk/Работа/1.СКМ ГРУПП/Золоторожская/протокол 16 гнб.xlsx";
const OUT_DIR  = "tmp-protocol-test";

// ---------------------------------------------------------------------------
// Load original protocol values for comparison
// ---------------------------------------------------------------------------
function loadOriginal(): Array<{ n: number; len: number; slope: number; depth: number }> {
  const wb = XLSX.readFile(ORIGINAL);
  const ws = wb.Sheets["10-1С"];
  const DATA_START = 27; // row 28, 0-indexed
  const rows: Array<{ n: number; len: number; slope: number; depth: number }> = [];

  for (let r = DATA_START; r <= DATA_START + 60; r++) {
    const nCell    = ws[XLSX.utils.encode_cell({ r, c: 0 })];
    const lenCell  = ws[XLSX.utils.encode_cell({ r, c: 1 })];
    const slopeCell= ws[XLSX.utils.encode_cell({ r, c: 2 })];
    const depthCell= ws[XLSX.utils.encode_cell({ r, c: 3 })];

    if (!nCell) break;
    const n = typeof nCell.v === "number" ? nCell.v : parseInt(String(nCell.v), 10);
    if (!n || isNaN(n)) break;

    rows.push({
      n,
      len:   typeof lenCell?.v   === "number" ? lenCell.v   : parseFloat(String(lenCell?.v ?? "0")),
      slope: typeof slopeCell?.v === "number" ? slopeCell.v : parseFloat(String(slopeCell?.v ?? "0")),
      depth: typeof depthCell?.v === "number" ? depthCell.v : parseFloat(String(depthCell?.v ?? "0")),
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("Loading catalog:", CATALOG);
  const raw = parseExcelCatalog(CATALOG);
  console.log(`  → ${raw.length} points`);

  const computed = calcProtocol(raw);
  console.log(`  → ${computed.length} sections\n`);

  const original = loadOriginal();
  console.log(`  → ${original.length} original sections\n`);

  // Compare
  let maxLenErr   = 0;
  let maxSlopeErr = 0;
  let failures    = 0;

  const LEN_TOL   = 0.01;
  const SLOPE_TOL = 0.01;

  console.log("n | calc_len | orig_len | Δlen | calc_slope | orig_slope | Δslope");
  console.log("--+---------+---------+------+-----------+-----------+-------");

  for (let i = 0; i < Math.min(computed.length, original.length); i++) {
    const c = computed[i];
    const o = original[i];
    const dLen   = Math.abs(c.section_length_m - o.len);
    const dSlope = Math.abs(c.slope - o.slope);

    maxLenErr   = Math.max(maxLenErr, dLen);
    maxSlopeErr = Math.max(maxSlopeErr, dSlope);

    const ok = dLen <= LEN_TOL && dSlope <= SLOPE_TOL;
    if (!ok) failures++;

    const flag = ok ? "" : " ← FAIL";
    console.log(
      `${String(c.n).padStart(2)} | ${c.section_length_m.toFixed(2).padStart(7)} | ${o.len.toFixed(2).padStart(7)} | ${dLen.toFixed(3).padStart(4)} | ${c.slope.toFixed(3).padStart(9)} | ${o.slope.toFixed(3).padStart(9)} | ${dSlope.toFixed(3).padStart(6)}${flag}`
    );
  }

  console.log(`\nMax Δlen: ${maxLenErr.toFixed(4)}m  (tol ${LEN_TOL})`);
  console.log(`Max Δslope: ${maxSlopeErr.toFixed(4)}  (tol ${SLOPE_TOL})`);
  console.log(failures === 0 ? "\n✅ All sections within tolerance." : `\n❌ ${failures} sections out of tolerance.`);

  // Render protocol
  const result = await renderProtocol(
    {
      object_title: "«ПКЛ 20 кВ №29-1 от места врезки в ПКЛ №29 до РП Золоторожская»",
      transition_number: "№16",
      date: new Date(2025, 0, 1),
      points: computed,
    },
    OUT_DIR
  );

  console.log(`\nRendered: ${result.filePath} (${result.pointCount} sections)`);
}

main().catch((e) => {
  console.error("❌ Error:", e.message);
  process.exit(1);
});
