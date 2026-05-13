/**
 * Seed: Салтыковская ГНБ №1 — organizations and people from the МКС АОСР шаблон.
 *
 * Creates/updates:
 *   organizations: МКС, ООО «СМК», ООО «СКМ-ГРУПП»
 *   people: Гусев П.А., Прошин Н.Н., Тишков В.А., Сергеев А.А., Картавченко А.Л., Рящиков М.Ю.
 *   person_documents: ИНРС/НРС + приказы/распоряжения
 *
 * Idempotent: uses INSERT OR REPLACE on all records.
 *
 * Run: npx tsx scripts/seed-saltykova.ts
 */
import { getDb } from "../src/db/client.js";
import { sql } from "drizzle-orm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEMORY_DIR = path.join(__dirname, "../.gnb-memory");

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
      aosr_block:
        "МКС – филиал ПАО «Россети Московский регион» " +
        "ОГРН 1057746555811, ИНН 5036065113, 115035, г. Москва, ул. Садовническая, д.36 , тел.: 8 (495) 668-22-28 " +
        "СРО СОЮЗ «ЭНЕРГОСТРОЙ», ОГРН 1097799013751, ИНН 7708237433",
    },
    {
      id: "org-smk",
      name: "ООО «СМК»",
      short_name: "СМК",
      ogrn: "1167154074570",
      inn: "7130031154",
      legal_address: "153510, Ивановская область, г. Кохма, ул. Октябрьская, дом 49а, этаж 2, помещение №1",
      phone: "8-499-288-00-98",
      sro_name: "СРО Ассоциация \"Саморегулируемая организация \"Ивановское Объединение Строителей\"",
      sro_number: "СРО-С-114-16122009",
      sro_date: "14.06.2019",
      aosr_block:
        "ООО «СМК» " +
        "ОГРН 1167154074570, ИНН 7130031154,  153510, Ивановская область, г. Кохма, " +
        "ул. Октябрьская, дом 49а, этаж 2, помещение №1, тел. 8-499-288-00-98; " +
        "СРО-С-114-16122009 от 14.06.2019г., СРО Ассоциация \"Саморегулируемая организация " +
        "\"Ивановское Объединение Строителей\", ОГРН 1093700000426, ИНН 3702587586",
    },
    {
      id: "org-skmgrupp",
      name: "ООО «СКМ-ГРУПП»",
      short_name: "СКМ-ГРУПП",
      ogrn: "5167746459579",
      inn: "9723046395",
      legal_address: "125481 г. Москва, ул. Свободы, д.103, стр.10 комн.4",
      phone: "+7 499 755-60-20",
      sro_name: "СРО Ассоциация СРО «ЭкспертСтрой»",
      aosr_block:
        "ООО «СКМ-ГРУПП» " +
        "ОГРН 5167746459579, ИНН 9723046395, 117303, 125481 г. Москва, ул. Свободы, " +
        "д.103, стр.10 комн.4 тел. +7 499 755-60-20; СРО Ассоциация СРО «ЭкспертСтрой» " +
        "ОГРН 1127799010668 ИНН 7708240612",
    },
  ] as const;

  for (const org of orgs) {
    await db.run(sql`
      INSERT OR REPLACE INTO organizations
        (id, name, short_name, ogrn, inn, legal_address, phone, sro_name, sro_number, sro_date, aosr_block, created_at, updated_at)
      VALUES
        (${org.id}, ${org.name}, ${org.short_name},
         ${org.ogrn ?? null}, ${org.inn ?? null}, ${org.legal_address ?? null},
         ${org.phone ?? null}, ${"sro_name" in org ? org.sro_name : null},
         ${"sro_number" in org ? org.sro_number : null}, ${"sro_date" in org ? org.sro_date : null},
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
      id: "person-gusev",
      full_name: "Гусев П.А.",
      surname: "Гусев",
      position: "Зам. начальника УКС ЮВО МКС",
      position_long: "Заместитель начальника УКС ЮВО МКС филиал ПАО «РОССЕТИ МОСКОВСКИЙ РЕГИОН»",
      org_id: "org-mks",
      aosr_full_line:
        "Заместитель начальника УКС ЮВО МКС филиал ПАО «РОССЕТИ МОСКОВСКИЙ РЕГИОН» Гусев П.А.",
      docs: [
        { doc_type: "ИНРС", doc_number: "С-77-204102", doc_date: "18.10.2019", role_granted: "строительный контроль" },
        { doc_type: "распоряжение", doc_number: "1399р", doc_date: "01.07.2025", role_granted: "технический надзор МКС" },
      ],
    },
    {
      id: "person-proshin",
      full_name: "Прошин Н.Н.",
      surname: "Прошин",
      position: "Зам. ген. директора по развитию ООО «СМК»",
      position_long: "Заместитель генерального директора по развитию ООО «СМК»",
      org_id: "org-smk",
      aosr_full_line:
        "Заместитель генерального директора по развитию ООО «СМК» Прошин Н.Н., " +
        "ИНРС в области строительства С-71-081355 от 21.08.2017г.; приказ №18-ЛНА от 09.01.2019г.",
      docs: [
        { doc_type: "ИНРС", doc_number: "С-71-081355", doc_date: "21.08.2017", role_granted: "строительный контроль" },
        { doc_type: "приказ", doc_number: "18-ЛНА", doc_date: "09.01.2019", role_granted: "полномочия" },
      ],
    },
    {
      id: "person-tishkov",
      full_name: "Тишков В.А.",
      surname: "Тишков",
      position: "Зам. начальника ПТО ООО «СМК»",
      position_long: "Заместитель начальника ПТО ООО «СМК»",
      org_id: "org-smk",
      aosr_full_line:
        "Зам. начальника ПТО ООО «СМК» Тишков В.А., " +
        "С-77-233823 от 25.05.2021г.; приказ №18-ЛНА 1 от 03.11.2020г.",
      docs: [
        { doc_type: "ИНРС", doc_number: "С-77-233823", doc_date: "25.05.2021", role_granted: "строительный контроль" },
        { doc_type: "приказ", doc_number: "18-ЛНА 1", doc_date: "03.11.2020", role_granted: "полномочия" },
      ],
    },
    {
      id: "person-sergeev",
      full_name: "Сергеев А.А.",
      surname: "Сергеев",
      position: "ГИП ООО «СМК»",
      position_long: "Главный инженер проекта ООО «СМК»",
      org_id: "org-smk",
      aosr_full_line:
        "ГИП ООО «СМК» Сергеев А.А., " +
        "индетификационный номер в НРС в НОПРИЗ ПИ-125535 от 19.02.2021г; Приказ №27-ЛНА от 03.02.2022г.",
      docs: [
        { doc_type: "НРС-НОПРИЗ", doc_number: "ПИ-125535", doc_date: "19.02.2021", role_granted: "ГИП" },
        { doc_type: "приказ", doc_number: "27-ЛНА", doc_date: "03.02.2022", role_granted: "полномочия ГИП" },
      ],
    },
    {
      id: "person-kartavchenko",
      full_name: "Картавченко А.Л.",
      surname: "Картавченко",
      position: "Главный инженер ООО «СКМ-ГРУПП»",
      position_long: "Главный инженер ООО «СКМ-ГРУПП»",
      org_id: "org-skmgrupp",
      aosr_full_line:
        "Главный инженер ООО «СКМ-ГРУПП» Картавченко А.Л., Приказ №25-11-03-1 от 03.11.2023 г.",
      docs: [
        { doc_type: "приказ", doc_number: "25-11-03-1", doc_date: "03.11.2023", role_granted: "представитель исполнителя" },
      ],
    },
    {
      id: "person-ryashchikov",
      full_name: "Рящиков М.Ю.",
      surname: "Рящиков",
      position: "Старший мастер 7 РЭР УКС ЮВО МКС",
      position_long: "Старший мастер 7 РЭР УКС ЮВО МКС филиал ПАО «РОССЕТИ МОСКОВСКИЙ РЕГИОН»",
      org_id: "org-mks",
      aosr_full_line:
        "Старший мастер 7 РЭР УКС ЮВО МКС филиал ПАО «РОССЕТИ МОСКОВСКИЙ РЕГИОН» Рящиков М.Ю., " +
        "распоряжение №1399р от 01.07.2025г.",
      docs: [
        { doc_type: "распоряжение", doc_number: "1399р", doc_date: "01.07.2025", role_granted: "надзор 7 РЭР" },
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

    // Insert documents (delete existing first to avoid duplicates on re-seed)
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
  // Summary
  // ---------------------------------------------------------------------------
  const orgCount = await db.get<{ n: number }>(sql`SELECT COUNT(*) as n FROM organizations`);
  const peopleCount = await db.get<{ n: number }>(sql`SELECT COUNT(*) as n FROM people`);
  const docCount = await db.get<{ n: number }>(sql`SELECT COUNT(*) as n FROM person_documents`);
  console.log(`\n✅ DB: ${orgCount?.n} orgs, ${peopleCount?.n} people, ${docCount?.n} docs`);

  process.exit(0);
}

main().catch((e) => {
  console.error("❌ Error:", e.message ?? e);
  process.exit(1);
});
