/**
 * Test: extract GNB profile points from a PDF and generate a protocol.
 * Compares extracted section lengths against the known coordinate catalog.
 *
 * Run: npx tsx scripts/test-protocol-pdf.ts [path/to/profile.pdf]
 *
 * Default PDF: Zolotorozhskaya GNB#16 longitudinal profile
 */
import path from "node:path";
import { extractProfileFromPdf } from "../src/extractor/pdf-profile.js";
import { calcProtocol } from "../src/calculator/gnb-math.js";
import { parseExcelCatalog } from "../src/parser/coord-catalog.js";
import { renderProtocol } from "../src/renderer/protocol.js";

const DEFAULT_PDF    = "C:/Users/kubko/YandexDisk/Работа/1.СКМ ГРУПП/Золоторожская/ГНБ 16-16.pdf";
const REFERENCE_CATALOG = "C:/Users/kubko/YandexDisk/Работа/1.СКМ ГРУПП/Золоторожская/каталог гнб 16.xlsx";
const OUT_DIR        = "tmp-protocol-pdf-test";

async function main() {
  const pdfPath = process.argv[2] ?? DEFAULT_PDF;
  console.log("PDF:", pdfPath);
  console.log("Reference catalog:", REFERENCE_CATALOG);
  console.log();

  // Extract from PDF
  console.log("Extracting points from PDF via Claude Vision...");
  let result;
  try {
    result = await extractProfileFromPdf(path.resolve(pdfPath), 120_000);
  } catch (e: unknown) {
    console.error("❌ Extraction failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  }

  const { points: rawPoints } = result;
  console.log(`  → ${rawPoints.length} points extracted`);

  // Compute protocol from extracted points
  const computed = calcProtocol(rawPoints);
  console.log(`  → ${computed.length} sections computed\n`);

  // Load reference from catalog
  let refSections;
  try {
    const refRaw = parseExcelCatalog(REFERENCE_CATALOG);
    refSections = calcProtocol(refRaw);
    console.log(`Reference (catalog): ${refSections.length} sections\n`);
  } catch {
    console.warn("⚠️  Could not load reference catalog — skipping accuracy check\n");
    refSections = null;
  }

  // Accuracy comparison
  if (refSections) {
    const count = Math.min(computed.length, refSections.length);
    let maxLenErrPct = 0;
    let fails = 0;

    console.log("n | pdf_len | ref_len | err%  | pdf_slope | ref_slope");
    console.log("--+--------+--------+-------+-----------+----------");

    for (let i = 0; i < count; i++) {
      const c = computed[i];
      const r = refSections[i];
      const errPct = r.section_length_m > 0
        ? Math.abs(c.section_length_m - r.section_length_m) / r.section_length_m * 100
        : 0;
      maxLenErrPct = Math.max(maxLenErrPct, errPct);
      if (errPct > 5) fails++;

      const flag = errPct > 5 ? " ← FAIL" : "";
      console.log(
        `${String(c.n).padStart(2)} | ${c.section_length_m.toFixed(2).padStart(6)} | ${r.section_length_m.toFixed(2).padStart(6)} | ${errPct.toFixed(1).padStart(5)}% | ${c.slope.toFixed(3).padStart(9)} | ${r.slope.toFixed(3).padStart(8)}${flag}`
      );
    }

    console.log(`\nMax length error: ${maxLenErrPct.toFixed(1)}%  (tolerance 5%)`);
    if (fails === 0) {
      console.log("✅ All sections within 5% tolerance.");
    } else {
      console.log(`⚠️  ${fails} sections exceed 5% — Vision accuracy needs improvement.`);
      console.log("   Consider refining PROTOCOL_PDF_PROMPT in src/extractor/pdf-profile.ts");
    }
  }

  // Render output
  const rendered = await renderProtocol(
    {
      object_title: "«Продольный профиль ГНБ — извлечён из PDF»",
      transition_number: "PDF-test",
      date: new Date(),
      points: computed,
    },
    OUT_DIR
  );
  console.log(`\nRendered: ${rendered.filePath} (${rendered.pointCount} sections)`);
}

main().catch((e) => {
  console.error("❌ Fatal:", e instanceof Error ? e.message : e);
  process.exit(1);
});
