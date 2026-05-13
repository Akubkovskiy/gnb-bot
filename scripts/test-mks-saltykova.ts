/**
 * Test: generate МКС АОСР+РЭР package using Салтыковская (Лист1 reference) data.
 *
 * Compares generated Лист1 cells against the template's known-good values
 * (the template already has Салтыковка data, so generated = original).
 *
 * Run: npx tsx scripts/test-mks-saltykova.ts
 */
import XLSX from "xlsx";
import path from "node:path";
import { renderMksActs } from "../src/renderer/mks-acts.js";
import type { MksActsInput } from "../src/domain/mks-types.js";

const TEMPLATE = path.join(process.cwd(), "templates", "МКС АОСР+РЭР шаблон.xlsx");
const OUT_DIR  = "tmp-mks-saltykova";

// ---------------------------------------------------------------------------
// Exact Салтыковская data from the template (Лист1 cells, verified on disk)
// ---------------------------------------------------------------------------
const INPUT: MksActsInput = {
  object_title:
    "«Строительство 8КЛ-0,4 кВ от ТП-10/0,4кВ № 22172 до ВРУ-0,4кВ №1 Заявителя, " +
    "в т.ч. ПИР: г.Москва, ул. Салтыковская, д.5А» ",

  address:           "г. Москва, Салтыковская ул. д.5А",
  project_code:      "345716/ПС-25",
  transition_number: "№1 ",
  rer_department:    "7 РЭР УКС ЮВО МКС филиал ПАО «РОССЕТИ МОСКОВСКИЙ РЕГИОН»",

  dates: {
    start: new Date(Date.UTC(2025, 9, 27)), // 27.10.2025 (C50 serial 45957)
    end:   new Date(Date.UTC(2025, 9, 31)), // 31.10.2025 (C51 serial 45961)
  },

  // --- Подрядчик-строитель ---
  contractor_org_name: "ООО «СМК» ",
  contractor_org_details:
    "ОГРН 1167154074570, ИНН 7130031154,  153510, Ивановская область, г. Кохма, " +
    "ул. Октябрьская, дом 49а, этаж 2, помещение №1, тел. 8-499-288-00-98; " +
    "СРО-С-114-16122009 от 14.06.2019г., СРО Ассоциация \"Саморегулируемая организация " +
    "\"Ивановское Объединение Строителей\", ОГРН 1093700000426, ИНН 3702587586",

  // --- Проектировщик (СМК выступает и как подрядчик, и как проектировщик) ---
  designer_org_name: "ООО «СМК» ",
  designer_org_details:
    "  ОГРН 1167154074570, ИНН 7130031154,  153510, Ивановская область, г. Кохма, " +
    "ул. Октябрьская, дом 49а, этаж 2, помещение №1, тел. 8-499-288-00-98; " +
    "СРО-П-027-18092009 от 31.01.2018г., СРО Ассоциация проектных компаний " +
    "\"Межрегиональная ассоциация проектировщиков\", ОГРН 1097799009197, ИНН 7705048438" +
    "                          ",

  // --- Исполнитель ---
  executor_org_name:    "ООО «СКМ-ГРУПП»",
  executor_org_details:
    "ОГРН 5167746459579, ИНН 9723046395, 117303, 125481 г. Москва, ул. Свободы, " +
    "д.103, стр.10 комн.4 тел. +7 499 755-60-20; СРО Ассоциация СРО «ЭкспертСтрой» " +
    "ОГРН 1127799010668 ИНН 7708240612",

  contractor_short: " ООО «СКМ-ГРУПП»",
  designer_short:   "ООО «СМК» ",

  // --- Подписанты (4 раздельных поля: position + name + inrs + order) ---
  mks_rep: {
    position:   "Заместитель начальника УКС ЮВО МКС филиал ПАО «РОССЕТИ МОСКОВСКИЙ РЕГИОН»",
    name:       "Гусев П.А.",
    inrs:       "ИНРС в области строительства №С-77-204102 от 18.10.2019",
    order:      "распоряжение №1399р от 01.07.2025 г.",
    short_name: "Гусев П.А.",
  },
  contractor1: {
    position:   "Заместитель генерального директора по развитию ООО \"СМК\"",
    name:       "Прошин Н.Н., ",
    inrs:       "ИНРС в области строительства  С-71-081355 от 21.08.2017г.",
    order:      "приказ №18-ЛНА от 09.01.2019г.",
    short_name: "Прошин Н.Н.",
  },
  contractor2: {
    position:   "Зам. начальника ПТО ООО \"СМК\"",
    name:       "Тишков В.А., С-77-233823 от 25.05.2021г.",
    order:      " приказ №18-ЛНА 1 от 03.11.2020г.",
    short_name: "Тишков В.А.",
  },
  designer_rep: {
    position:   " ГИП ООО \"СМК\"",
    name:       "Сергеев А.А.,",
    inrs:       "индетификационный номер в НРС в НОПРИЗ ПИ-125535 от 19.02.2021г",
    order:      "Приказ №27-ЛНА от 03.02.2022г,",
    short_name: "Сергеев А.А.",
  },
  executor_rep: {
    position:   "Главный инженер ООО «СКМ-ГРУПП»",
    name:       "Картавченко А.Л.,",
    order:      "Приказ №25-11-03-1 от 03.11.2023 г.",
    short_name: "Картавченко А.Л.",
  },
  rer_rep: {
    position:   "Старший мастер 7 РЭР УКС ЮВО МКС филиал ПАО «РОССЕТИ МОСКОВСКИЙ РЕГИОН»",
    name:       "Рящиков М.Ю.",
    order:      "распоряжение №1399р от 01.07.2025г",
    short_name: "Рящиков М.Ю.",
  },

  // --- Технические параметры ---
  length_m:           63.64,
  pipe_count:         3,
  pipe_diameter_mm:   160,
  pipe_mark:          "ЭЛЕКТРОПАЙП ОС РС 160х8.9 SN16-N F90 T120",
  pipe_docs:
    "Паспорт качества №12514 от 09.10.2025г; " +
    "Сертификат соответствия №РОСС RU.HB24.АПТС H00165/24 до 20.02.2029г.  ",
  bentonite_qty_l:    6715,
  bentonite_info:
    "Глинопорошок бентонитовый для горизонтального бурения \"Bentopro standart\", " +
    "сертификат соответствия: RU.32468.04ЛЕГО.010.3869",
  polymer_qty_l:      345,
  polymer_info:       "Ингибитор глины «BentoPro PHPA»",
  final_expansion_mm: 500,
  plugs_info:         "Заглушки,  УКПТ 175/55 ",
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("Generating МКС АОСР+РЭР (Салтыковская reference data)...");
  const result = await renderMksActs(INPUT, OUT_DIR);
  console.log(`Written: ${result.filePath} (${result.cellsWritten} cells to Лист1)\n`);

  // --- Compare Лист1 cells against template ---
  console.log("=== Comparing generated Лист1 against template ===");

  const wbOrig = XLSX.readFile(TEMPLATE, { cellStyles: true, cellFormula: true });
  const s1Orig = wbOrig.Sheets["Лист1"];

  const wbGen  = XLSX.readFile(result.filePath, { cellStyles: true });
  const s1Gen  = wbGen.Sheets["Лист1"];

  // Cells we compare exactly against the template.
  // Person A-rows (A14-A32) are intentionally excluded: the original template
  // was filled inconsistently (some people had inrs on line1, others on line2).
  // Our 4-field renderer always uses line1=position+name, line2=inrs+order.
  // That differs from the ad-hoc template entries but is semantically correct.
  const CHECK_CELLS = [
    "A2",
    "A7", "A8", "A10", "A11",
    "A28", "A29",
    "B35", "B37", "B39", "B41", "B43", "B45",
    "C47", "C48", "C49", "C71",
    "C53", "C54", "C55", "C56",
    "C58", "C59", "C60", "C61", "C62", "C63", "C64", "C65",
    "C67", "C68", "C69",
  ];

  let diffs = 0;
  for (const addr of CHECK_CELLS) {
    const orig = s1Orig[addr];
    const gen  = s1Gen[addr];

    // For orig cells with formulas, use cached value; for direct values use v
    const ov = orig ? String(orig.v ?? "").trim() : "<empty>";
    const gv = gen  ? String(gen.v  ?? "").trim() : "<empty>";
    const match = ov === gv;

    if (!match) {
      diffs++;
      console.log(`✗ ${addr.padEnd(5)} orig: ${ov.slice(0, 80)}`);
      console.log(`       gen:  ${gv.slice(0, 80)}`);
    }
  }

  // --- Date cells (compare as Excel serial numbers) ---
  const DATE_CELLS = ["C50", "C51"];
  for (const addr of DATE_CELLS) {
    const orig = s1Orig[addr];
    const gen  = s1Gen[addr];
    const ov = orig?.v;
    const gv = gen?.v;
    if (ov !== gv) {
      diffs++;
      console.log(`✗ ${addr.padEnd(5)} orig: ${ov} gen: ${gv}`);
    }
  }

  if (diffs === 0) {
    console.log("✅ All checked Лист1 cells match template reference data.");
  } else {
    console.log(`\n❌ ${diffs} cell(s) differ.`);
  }

  // --- Person A-row format verification (our consistent 4-field format) ---
  console.log("\n=== Person cells (4-field format verification) ===");
  const personChecks: Array<{ addr: string; expected: string }> = [
    { addr: "A14", expected: `${INPUT.mks_rep.position} ${INPUT.mks_rep.name}` },
    { addr: "A15", expected: [INPUT.mks_rep.inrs, INPUT.mks_rep.order].filter(Boolean).join("  ") },
    { addr: "A17", expected: `${INPUT.contractor1.position} ${INPUT.contractor1.name}` },
    { addr: "A18", expected: [INPUT.contractor1.inrs, INPUT.contractor1.order].filter(Boolean).join("  ") },
    { addr: "A20", expected: `${INPUT.contractor2.position} ${INPUT.contractor2.name}` },
    { addr: "A21", expected: [INPUT.contractor2.inrs, INPUT.contractor2.order].filter(Boolean).join("  ") },
    { addr: "A23", expected: `${INPUT.designer_rep.position} ${INPUT.designer_rep.name}` },
    { addr: "A24", expected: [INPUT.designer_rep.inrs, INPUT.designer_rep.order].filter(Boolean).join("  ") },
    { addr: "A26", expected: `${INPUT.executor_rep.position} ${INPUT.executor_rep.name}` },
    { addr: "A27", expected: [INPUT.executor_rep.inrs, INPUT.executor_rep.order].filter(Boolean).join("  ") },
    { addr: "A31", expected: `${INPUT.rer_rep.position} ${INPUT.rer_rep.name}` },
    { addr: "A32", expected: [INPUT.rer_rep.inrs, INPUT.rer_rep.order].filter(Boolean).join("  ") },
  ];
  let personDiffs = 0;
  for (const { addr, expected } of personChecks) {
    const gen = s1Gen[addr];
    const gv = gen ? String(gen.v ?? "").trim() : "<empty>";
    if (gv !== expected.trim()) {
      personDiffs++;
      console.log(`✗ ${addr} gen:  ${gv.slice(0, 80)}`);
      console.log(`       exp: ${expected.trim().slice(0, 80)}`);
    }
  }
  if (personDiffs === 0) console.log("✅ All person cells match 4-field format.");

  // --- Show all sheets present ---
  const wbCheck = XLSX.readFile(result.filePath);
  console.log(`\nSheets in generated file (${wbCheck.SheetNames.length}):`);
  wbCheck.SheetNames.forEach((n, i) => console.log(`  [${i}] ${n}`));
}

main().catch((e) => {
  console.error("❌ Error:", e.message);
  process.exit(1);
});
