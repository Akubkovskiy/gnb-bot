/**
 * Seed: Лётчика Бабушкина вл.29/5, ГНБ №1-1 — full seed from MKS АОСР+РЭР parsed data.
 *
 * Creates/updates:
 *   organizations: МКС, ООО «СПЕЦИНЖСТРОЙ», ООО «СТРОЙМОНТАЖ»
 *   people: Жидков С.С., Блинов В.В., Щеглов Р.А., Швецов А.П.
 *   person_documents: ИНРС + orders
 *   customer: МКС (upsert — may already exist from Салтыковская seed)
 *   object: object-babushkina
 *   transition: trans-babushkina-1
 *   transition_signatories (6 roles)
 *   materials: pipe + bentonite + polymer + plugs
 *   transition_materials
 *   documents stored via storeDocumentSync
 *
 * Parsed from: 1. Letchika Babushkina/МКС АОСР+РЭР ЗП 1-1.xlsx
 *   transition_number: №1-1
 *   dates: 2026-03-31 → 2026-04-05
 *   length_m: 65.65
 *   pipe: 6 × ЭЛЕКТРОПАЙП АМПЕРА РС II 160×8,9 SN16-N d160mm, final exp 650mm
 *   orgs: СПЕЦИНЖСТРОЙ (contractor/designer), СТРОЙМОНТАЖ (executor)
 *   signatories: Жидков (МКС), Блинов (contractor1/2/designer), Щеглов (executor), Швецов (РЭР)
 *
 * Run: npx tsx scripts/seed-babushkina.ts
 */

import { getDb } from "../src/db/client.js";
import { sql } from "drizzle-orm";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { storeDocumentSync } from "../src/storage/document-store.js";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEMORY_DIR = path.join(__dirname, "../.gnb-memory");
const SOURCE_DIR = path.join(__dirname, "../1. Letchika Babushkina");

async function main() {
  const db = getDb(MEMORY_DIR);

  // ---------------------------------------------------------------------------
  // Organizations
  // ---------------------------------------------------------------------------
  console.log("=== Seeding organizations ===");

  const orgs = [
    {
      id: "org-mks",
      name: "МКС – филиал ПАО «Россети Московский регион»",
      short_name: "МКС",
      ogrn: "1057746555811",
      inn: "5036065113",
      legal_address: "115035, г. Москва, ул. Садовническая, д.36",
      phone: "8 (495) 668-22-28",
      sro_name: "СОЮЗ «ЭНЕРГОСТРОЙ»",
      sro_number: null,
      sro_date: null,
      aosr_block:
        "МКС – филиал ПАО «Россети Московский регион» " +
        "ОГРН 1057746555811, ИНН 5036065113, 115035, г. Москва, ул. Садовническая, д.36, тел.: 8 (495) 668-22-28 " +
        "СРО СОЮЗ «ЭНЕРГОСТРОЙ», ОГРН 1097799013751, ИНН 7708237433",
    },
    {
      id: "org-specinjstroy",
      name: "ООО «СПЕЦИНЖСТРОЙ»",
      short_name: "СПЕЦИНЖСТРОЙ",
      ogrn: "1167847487444",
      inn: "7806258664",
      legal_address: "123001, г. Москва, ул. Садовая-Кудринская, д. 25, помещ. 2/4",
      phone: null,
      sro_name: "СРО Ассоциация проектных компаний «Межрегиональная ассоциация проектировщиков»",
      sro_number: "СРО-П-027-18092009",
      sro_date: "31.01.2018",
      aosr_block:
        "ООО «СПЕЦИНЖСТРОЙ» " +
        "ОГРН 1167847487444, ИНН 7806258664, 123001, г. Москва, ул. Садовая-Кудринская, д. 25, помещ. 2/4; " +
        "СРО-П-027-18092009 от 31.01.2018г., СРО Ассоциация проектных компаний " +
        "«Межрегиональная ассоциация проектировщиков», ОГРН 1097799009197, ИНН 7705048438",
    },
    {
      id: "org-stroymontazh",
      name: "ООО «СТРОЙМОНТАЖ»",
      short_name: "СТРОЙМОНТАЖ",
      ogrn: "1157746324812",
      inn: "7733229740",
      legal_address: "123557, г. Москва, вн. тер. г. МО Пресненский, пер. Электрический, д. 3/10, стр. 3",
      phone: null,
      sro_name: null,
      sro_number: null,
      sro_date: null,
      aosr_block:
        "ООО «СТРОЙМОНТАЖ» " +
        "ОГРН 1157746324812, ИНН 7733229740, " +
        "123557, г. Москва, вн. тер. г. МО Пресненский, пер. Электрический, д. 3/10, стр. 3",
    },
  ];

  for (const org of orgs) {
    await db.run(sql`
      INSERT OR REPLACE INTO organizations
        (id, name, short_name, ogrn, inn, legal_address, phone, sro_name, sro_number, sro_date, aosr_block, created_at, updated_at)
      VALUES
        (${org.id}, ${org.name}, ${org.short_name},
         ${org.ogrn ?? null}, ${org.inn ?? null}, ${org.legal_address ?? null},
         ${org.phone ?? null}, ${org.sro_name ?? null},
         ${org.sro_number ?? null}, ${org.sro_date ?? null},
         ${org.aosr_block}, datetime('now'), datetime('now'))
    `);
    console.log(`  ✓ ${org.name}`);
  }

  // ---------------------------------------------------------------------------
  // People + documents
  // ---------------------------------------------------------------------------
  console.log("\n=== Seeding people ===");

  type PersonSeed = {
    id: string;
    full_name: string;
    surname: string;
    position: string;
    position_long: string;
    org_id: string;
    aosr_full_line: string;
    docs: Array<{ doc_type: string; doc_number: string; doc_date?: string; role_granted?: string }>;
  };

  const persons: PersonSeed[] = [
    {
      // From A14/A15/B35: МКС representative (СВАО vs ЮВО branch)
      id: "person-zhidkov",
      full_name: "Жидков С.С.",
      surname: "Жидков",
      position: "Зам. начальника УКС СВАО МКС",
      position_long: "Заместитель начальника УКС СВАО МКС филиал ПАО «РОССЕТИ МОСКОВСКИЙ РЕГИОН»",
      org_id: "org-mks",
      aosr_full_line:
        "Заместитель начальника УКС СВАО МКС филиал ПАО «РОССЕТИ МОСКОВСКИЙ РЕГИОН» Жидков С.С., " +
        "ИНРС в области строительства №С-77-204102 от 18.10.2019; распоряжение №1399р от 01.07.2025 г.",
      docs: [
        { doc_type: "ИНРС", doc_number: "С-77-204102", doc_date: "18.10.2019", role_granted: "строительный контроль" },
        { doc_type: "распоряжение", doc_number: "1399р", doc_date: "01.07.2025", role_granted: "технический надзор МКС СВАО" },
      ],
    },
    {
      // From A17-A20/B37-B39 + A23/B41: contractor1 + contractor2 + designer (same person — Блинов)
      id: "person-blinov",
      full_name: "Блинов В.В.",
      surname: "Блинов",
      position: "Главный инженер проектов ООО «СТРОЙМОНТАЖ»",
      position_long: "Главный инженер проектов ООО «СТРОЙМОНТАЖ»",
      org_id: "org-stroymontazh",
      aosr_full_line:
        "Главный инженер проектов ООО «СТРОЙМОНТАЖ» Блинов В.В., " +
        "ИНРС в области строительства С-71-081355 от 21.08.2017г.; приказ №323 от 03.12.2025",
      docs: [
        { doc_type: "ИНРС", doc_number: "С-71-081355", doc_date: "21.08.2017", role_granted: "строительный контроль" },
        { doc_type: "приказ", doc_number: "323", doc_date: "03.12.2025", role_granted: "полномочия ГИП" },
      ],
    },
    {
      // From A26/A27/B43: executor representative
      id: "person-shcheglov",
      full_name: "Щеглов Р.А.",
      surname: "Щеглов",
      position: "Начальник участка ООО «СТРОЙМОНТАЖ»",
      position_long: "Начальник участка ООО «СТРОЙМОНТАЖ»",
      org_id: "org-stroymontazh",
      aosr_full_line:
        "Начальник участка ООО «СТРОЙМОНТАЖ» Щеглов Р.А., Приказ №25-11-03-1 от 03.11.2023 г.",
      docs: [
        { doc_type: "приказ", doc_number: "25-11-03-1", doc_date: "03.11.2023", role_granted: "представитель исполнителя" },
      ],
    },
    {
      // From A31/A32/B45: РЭР representative
      id: "person-shvetsov",
      full_name: "Швецов А.П.",
      surname: "Швецов",
      position: "Старший мастер 13 РЭР УКС СВАО МКС",
      position_long: "Старший мастер 13 РЭР МКС филиал ПАО «РОССЕТИ МОСКОВСКИЙ РЕГИОН»",
      org_id: "org-mks",
      aosr_full_line:
        "Старший мастер 13 РЭР МКС филиал ПАО «РОССЕТИ МОСКОВСКИЙ РЕГИОН» Швецов А.П., " +
        "распоряжение №1399р от 01.07.2025г",
      docs: [
        { doc_type: "распоряжение", doc_number: "1399р", doc_date: "01.07.2025", role_granted: "надзор 13 РЭР" },
      ],
    },
  ];

  for (const person of persons) {
    await db.run(sql`
      INSERT OR REPLACE INTO people
        (id, full_name, surname, position, position_long, org_id, aosr_full_line, is_active, created_at, updated_at)
      VALUES
        (${person.id}, ${person.full_name}, ${person.surname},
         ${person.position}, ${person.position_long}, ${person.org_id},
         ${person.aosr_full_line}, 1, datetime('now'), datetime('now'))
    `);

    // Delete existing docs before re-inserting (idempotent)
    await db.run(sql`DELETE FROM person_documents WHERE person_id = ${person.id}`);

    for (const doc of person.docs) {
      await db.run(sql`
        INSERT INTO person_documents
          (person_id, doc_type, doc_number, doc_date, role_granted, is_current, created_at)
        VALUES
          (${person.id}, ${doc.doc_type}, ${doc.doc_number},
           ${doc.doc_date ?? null}, ${doc.role_granted ?? null}, 1, datetime('now'))
      `);
    }

    console.log(`  ✓ ${person.full_name} (${person.position}) — ${person.docs.length} docs`);
  }

  // ---------------------------------------------------------------------------
  // Customer — МКС (reuse from Салтыковская if exists, upsert)
  // ---------------------------------------------------------------------------
  console.log("\n=== Seeding customer ===");

  await db.run(sql`
    INSERT OR REPLACE INTO customers
      (id, name, official_name, org_id, created_at)
    VALUES
      ('customer-mks',
       'МКС',
       'МКС – филиал ПАО «Россети Московский регион»',
       'org-mks',
       datetime('now'))
  `);

  await db.run(sql`
    INSERT OR IGNORE INTO customer_aliases (customer_id, alias)
    VALUES
      ('customer-mks', 'МКС'),
      ('customer-mks', 'Россети МР'),
      ('customer-mks', 'Московские кабельные сети')
  `);
  console.log("  ✓ МКС");

  // ---------------------------------------------------------------------------
  // Object — Летчика Бабушкина вл.29/5
  // ---------------------------------------------------------------------------
  console.log("\n=== Seeding object ===");

  await db.run(sql`
    INSERT OR REPLACE INTO objects
      (id, customer_id, short_name, official_name, title_line, default_address, default_project_number, created_at, updated_at)
    VALUES
      ('object-babushkina',
       'customer-mks',
       'Летчика Бабушкина',
       'ул. Лётчика Бабушкина, вл.29/5',
       '«Строительство новой ТП-10/0,4кВ с тр-ми 2х400кВА, 4КЛ-10кВ от новой ТП-10/0,4кВ до ТП №28450, до врезки в КЛ-10кВ напр-ем ТП №28450 (А и Б) — ТП №25424 в сторону ТП №25424, 8КЛ-0,4кВ от новой ТП до ВРЩ-0,4 кВ №1-3,5, установка счетчиков учета э/э — 4 шт., в т.ч. ПИР: г.Москва, ул.Лётчика Бабушкина, вл.29/5 для нужд МКС – филиала ПАО «Россети Московский регион»»',
       'г. Москва, ул. Летчика Бабушкина, вл.29/5',
       '___ШИФР___',
       datetime('now'), datetime('now'))
  `);
  console.log("  ✓ Летчика Бабушкина вл.29/5");

  // ---------------------------------------------------------------------------
  // Materials
  // ---------------------------------------------------------------------------
  console.log("\n=== Seeding materials ===");

  const materials = [
    {
      id: "mat-electropipe-ampera-160",
      material_type: "pipe",
      name: "ЭЛЕКТРОПАЙП АМПЕРА РС II 160 х 8,9 SN16 - N Fmax90 T120",
      manufacturer: "ЭЛЕКТРОПАЙП",
      specifications: "ПЭ100, SN16, d160x8,9мм, Fmax90, T120; Паспорт качества №1317; Сертификат РОСС RU.МЛ10.Н12248 с 19.12.2025",
    },
    {
      id: "mat-bentosolo-pg",
      material_type: "bentonite",
      name: "Глинопорошок бентонитовый для горизонтального бурения \"Bentosolo PG\"",
      manufacturer: "Bentosolo",
      specifications: "паспорт качества №1234",
    },
    {
      id: "mat-bentopro-phpa-babushkina",
      material_type: "polymer",
      name: "Ингибитор глины «BentoPro PHPA»",
      manufacturer: "BentoPro",
      specifications: null,
    },
    {
      id: "mat-ukpt-175-55-babushkina",
      material_type: "plugs",
      name: "Заглушки УКПТ 175/55",
      manufacturer: null,
      specifications: "Финальное расширение 650мм",
    },
  ];

  for (const m of materials) {
    await db.run(sql`
      INSERT OR REPLACE INTO materials
        (id, material_type, name, manufacturer, specifications, created_at, updated_at)
      VALUES
        (${m.id}, ${m.material_type}, ${m.name},
         ${m.manufacturer ?? null}, ${m.specifications ?? null},
         datetime('now'), datetime('now'))
    `);
    console.log(`  ✓ ${m.name.slice(0, 60)}`);
  }

  // ---------------------------------------------------------------------------
  // Transition — ГНБ №1-1, Летчика Бабушкина
  // ---------------------------------------------------------------------------
  console.log("\n=== Seeding transition ===");

  // Parsed from act: date_start_serial=46112 → 2026-03-31, date_end_serial=46117 → 2026-04-05
  await db.run(sql`
    INSERT OR REPLACE INTO transitions
      (id, object_id, gnb_number, gnb_number_short, status,
       address, project_number, title_line,
       executor_id,
       start_date, end_date, act_date,
       profile_length, plan_length,
       pipe_count, pipe_diameter_mm, drill_diameter,
       pipe_mark, pipe_quality_passport,
       created_at, updated_at, finalized_at)
    VALUES
      ('trans-babushkina-1',
       'object-babushkina',
       'ГНБ ЗП 1-1', '1-1', 'finalized',
       'г. Москва, ул. Летчика Бабушкина, вл.29/5',
       '___ШИФР___',
       '«Строительство 8КЛ-0,4кВ от новой ТП до ВРЩ-0,4 кВ, ГНБ переход №1-1»',
       'org-stroymontazh',
       '2026-03-31', '2026-04-05', '2026-04-05',
       65.65, 65.65,
       6, 160.0, 650.0,
       'ЭЛЕКТРОПАЙП АМПЕРА РС II 160 х 8,9 SN16 - N Fmax90 T120',
       'Паспорт качества №1317; Сертификат соответствия №РОСС RU.МЛ10.Н12248 с 19.12.2025',
       datetime('now'), datetime('now'), '2026-04-05T00:00:00Z')
  `);
  console.log("  ✓ ГНБ ЗП 1-1 (31.03–05.04.2026, 65.65м, 6 труб d160)");

  // ---------------------------------------------------------------------------
  // Transition organizations
  // ---------------------------------------------------------------------------
  console.log("\n=== Seeding transition_orgs ===");

  const transOrgs = [
    { role: "customer",   org_id: "org-mks" },
    { role: "contractor", org_id: "org-specinjstroy" },
    { role: "designer",   org_id: "org-specinjstroy" },
    { role: "executor",   org_id: "org-stroymontazh" },
  ];

  for (const to of transOrgs) {
    await db.run(sql`
      INSERT OR REPLACE INTO transition_orgs
        (transition_id, role, org_id)
      VALUES ('trans-babushkina-1', ${to.role}, ${to.org_id})
    `);
    console.log(`  ✓ ${to.role} → ${to.org_id}`);
  }

  // ---------------------------------------------------------------------------
  // Transition signatories (6 roles from МКС АОСР template)
  // ---------------------------------------------------------------------------
  console.log("\n=== Seeding transition_signatories ===");

  // Clear existing (idempotent)
  await db.run(sql`
    DELETE FROM transition_signatories WHERE transition_id = 'trans-babushkina-1'
  `);

  const signatories = [
    {
      role: "mks_rep",
      person_id: "person-zhidkov",
      org_id: "org-mks",
      position_override: "Заместитель начальника УКС СВАО МКС филиал ПАО «РОССЕТИ МОСКОВСКИЙ РЕГИОН»",
    },
    {
      role: "contractor1",       // строительный контроль
      person_id: "person-blinov",
      org_id: "org-stroymontazh",
      position_override: "Главный инженер проектов ООО «СТРОЙМОНТАЖ»",
    },
    {
      role: "contractor2",       // выполнял работы
      person_id: "person-blinov",
      org_id: "org-stroymontazh",
      position_override: "Главный инженер проектов ООО «СТРОЙМОНТАЖ»",
    },
    {
      role: "designer_rep",
      person_id: "person-blinov",
      org_id: "org-stroymontazh",
      position_override: "Главный инженер проектов ООО «СТРОЙМОНТАЖ»",
    },
    {
      role: "executor_rep",
      person_id: "person-shcheglov",
      org_id: "org-stroymontazh",
      position_override: "Начальник участка ООО «СТРОЙМОНТАЖ»",
    },
    {
      role: "rer_rep",
      person_id: "person-shvetsov",
      org_id: "org-mks",
      position_override: "Старший мастер 13 РЭР МКС филиал ПАО «РОССЕТИ МОСКОВСКИЙ РЕГИОН»",
    },
  ];

  for (const s of signatories) {
    await db.run(sql`
      INSERT INTO transition_signatories
        (transition_id, role, person_id, org_id, position_override, created_at)
      VALUES
        ('trans-babushkina-1', ${s.role}, ${s.person_id}, ${s.org_id},
         ${s.position_override ?? null}, datetime('now'))
    `);
    console.log(`  ✓ ${s.role} → ${s.person_id}`);
  }

  // ---------------------------------------------------------------------------
  // Transition materials
  // ---------------------------------------------------------------------------
  console.log("\n=== Seeding transition_materials ===");

  await db.run(sql`
    DELETE FROM transition_materials WHERE transition_id = 'trans-babushkina-1'
  `);

  const transMaterials = [
    { material_id: "mat-electropipe-ampera-160", quantity: "6 труб × 65.65м = 393.9м",  notes: "Паспорт качества №1317; Сертификат РОСС RU.МЛ10.Н12248" },
    { material_id: "mat-bentosolo-pg",           quantity: "23500 л",                    notes: null },
    { material_id: "mat-bentopro-phpa-babushkina", quantity: "1200 л",                   notes: null },
    { material_id: "mat-ukpt-175-55-babushkina", quantity: null,                          notes: "Финальное расширение 650мм" },
  ];

  for (const tm of transMaterials) {
    await db.run(sql`
      INSERT INTO transition_materials
        (transition_id, material_id, quantity, notes, created_at)
      VALUES
        ('trans-babushkina-1', ${tm.material_id}, ${tm.quantity ?? null}, ${tm.notes ?? null}, datetime('now'))
    `);
    console.log(`  ✓ ${tm.material_id}`);
  }

  // ---------------------------------------------------------------------------
  // Store source documents
  // ---------------------------------------------------------------------------
  console.log("\n=== Storing documents ===");

  const filesToStore = [
    {
      src: "Труба - 07-26-0140036 (ГНБ).pdf",
      originalFilename: "Труба - 07-26-0140036 (ГНБ).pdf",
      docType: "passport_pipe",
      linkType: "transition",
      targetId: "trans-babushkina-1",
      relation: "passport",
      docNumber: "07-26-0140036",
      label: "Паспорт трубы",
    },
    {
      src: "Приказ №323  Щеглов.pdf",
      originalFilename: "Приказ №323 Щеглов.pdf",
      docType: "order",
      linkType: "person",
      targetId: "person-shcheglov",
      relation: "order",
      docNumber: "323",
      label: "Приказ №323 (Щеглов)",
    },
    {
      src: "ACAD гнб 1-1 изм 2-1-1.pdf",
      originalFilename: "ИС ГНБ 1-1.pdf",
      docType: "executive_scheme",
      linkType: "transition",
      targetId: "trans-babushkina-1",
      relation: "scheme",
      docNumber: null,
      label: "Исполнительная схема ГНБ 1-1",
    },
    {
      src: "МКС АОСР+РЭР ЗП 1-1.xlsx",
      originalFilename: "МКС АОСР+РЭР ЗП 1-1.xlsx",
      docType: "prior_aosr",
      linkType: "transition",
      targetId: "trans-babushkina-1",
      relation: "reference_act",
      docNumber: null,
      label: "МКС АОСР+РЭР (референсный акт)",
    },
  ];

  for (const f of filesToStore) {
    const srcPath = path.join(SOURCE_DIR, f.src);
    if (!fs.existsSync(srcPath)) {
      console.log(`  ⚠ Файл не найден, пропускаем: ${f.src}`);
      continue;
    }
    try {
      const result = storeDocumentSync(db, {
        tempFilePath: srcPath,
        originalFilename: f.originalFilename,
        docType: f.docType,
        linkType: f.linkType,
        targetId: f.targetId,
        relation: f.relation,
        customerName: "МКС",
        objectName: "Летчика Бабушкина",
        gnbNumberShort: "1-1",
        docNumber: f.docNumber ?? undefined,
      });
      console.log(`  ✓ ${f.label} → ${result.storedPath}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ⚠ Ошибка при сохранении ${f.label}: ${msg}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  const counts = {
    orgs:      await db.get<{ n: number }>(sql`SELECT COUNT(*) as n FROM organizations`),
    people:    await db.get<{ n: number }>(sql`SELECT COUNT(*) as n FROM people`),
    docs:      await db.get<{ n: number }>(sql`SELECT COUNT(*) as n FROM person_documents`),
    customers: await db.get<{ n: number }>(sql`SELECT COUNT(*) as n FROM customers`),
    objects:   await db.get<{ n: number }>(sql`SELECT COUNT(*) as n FROM objects`),
    trans:     await db.get<{ n: number }>(sql`SELECT COUNT(*) as n FROM transitions`),
    sigs:      await db.get<{ n: number }>(sql`SELECT COUNT(*) as n FROM transition_signatories`),
    mats:      await db.get<{ n: number }>(sql`SELECT COUNT(*) as n FROM materials`),
    storedDocs: await db.get<{ n: number }>(sql`SELECT COUNT(*) as n FROM documents`),
  };

  console.log(
    `\n✅ DB summary:\n` +
    `   orgs: ${counts.orgs?.n}, people: ${counts.people?.n}, person_docs: ${counts.docs?.n}\n` +
    `   customers: ${counts.customers?.n}, objects: ${counts.objects?.n}, transitions: ${counts.trans?.n}\n` +
    `   signatories: ${counts.sigs?.n}, materials: ${counts.mats?.n}, stored docs: ${counts.storedDocs?.n}`,
  );

  process.exit(0);
}

main().catch((e) => {
  console.error("❌ Error:", e.message ?? e);
  process.exit(1);
});
