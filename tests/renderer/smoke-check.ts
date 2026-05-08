/**
 * Smoke check: generate internal acts for both signatory scenarios,
 * dump all Лист1 cell values for visual verification.
 *
 * Run: npx tsx tests/renderer/smoke-check.ts
 */

import { renderInternalActs } from "../../src/renderer/internal-acts.js";
import { makeTestTransition } from "./fixtures.js";
import ExcelJS from "exceljs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CELLS: [string, string][] = [
  ["B4", "title_line"], ["B5", "address"],
  ["B6", "gnb_number"], ["B7", "project_number"],
  ["B8", "start_date"], ["B9", "end_date"],
  ["B10", "executor"], ["B11", "completion_date"],
  ["B14", "customer"], ["B15", "contractor"], ["B16", "designer"],
  ["B20", "sign1_desc"], ["C20", "sign1_sign"],
  ["B21", "sign2_desc"], ["C21", "sign2_sign"],
  ["B22", "sign3_desc"], ["C22", "sign3_sign"],
  ["B23", "tech_desc"], ["C23", "tech_sign"],
  ["B26", "pipe_mark"], ["B27", "pipe_diameter"],
  ["A31", "gnb_table"], ["B31", "plan_L"], ["C31", "profile_L"],
  ["D31", "pipe_count"], ["E31", "L_tubes(f)"], ["F31", "drill_d"],
  ["G31", "config"], ["H31", "joints(f)"],
];

function displayValue(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "(null)";
  if (v === " ") return '" " (SPACE)';
  if (typeof v === "object" && "formula" in v) {
    return `FORMULA: ${(v as any).formula} = ${(v as any).result}`;
  }
  return String(v);
}

async function dumpScenario(label: string, transition: ReturnType<typeof makeTestTransition>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gnb-smoke-"));
  const result = await renderInternalActs(transition, dir);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(result.filePath);
  const sheet = wb.getWorksheet("Лист1")!;

  console.log(`\n${"═".repeat(60)}`);
  console.log(label);
  console.log(`${"═".repeat(60)}`);
  console.log(`Cells filled: ${result.cellsFilled}`);
  console.log(`Warnings: ${result.warnings.length ? result.warnings.join(", ") : "(none)"}`);
  console.log("");

  for (const [addr, name] of CELLS) {
    const v = sheet.getCell(addr).value;
    console.log(`  ${addr.padEnd(4)} ${name.padEnd(18)} │ ${displayValue(v)}`);
  }

  fs.rmSync(dir, { recursive: true, force: true });
}

async function main() {
  // Scenario 1: 3 signatories (full)
  await dumpScenario(
    "SCENARIO 1: 3 signatories (ЗП 5-5, Крафт/Марьино, sign3=Щеглов)",
    makeTestTransition(),
  );

  // Scenario 2: 2 signatories (no sign3)
  const t2 = makeTestTransition();
  t2.signatories.sign3_optional = undefined;
  await dumpScenario(
    "SCENARIO 2: 2 signatories (no sign3)",
    t2,
  );

  console.log("\n✓ Smoke check complete. Both scenarios generated successfully.\n");
}

main().catch((err) => {
  console.error("SMOKE CHECK FAILED:", err);
  process.exit(1);
});
