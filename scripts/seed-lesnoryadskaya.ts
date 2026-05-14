/**
 * Seed: Леснорядская — объект СКМ ГРУПП / МКС
 *
 * Переиспользует орги и людей из seed-saltykova.ts (INSERT OR IGNORE).
 * Создаёт объект Леснорядская. Переходы добавляются отдельно при получении акта.
 *
 * GDrive folder: https://drive.google.com/drive/folders/1gm_uMsdDMlkgb1nqNcw3qlYNexl5Nu7T
 *
 * Run: npx tsx scripts/seed-lesnoryadskaya.ts
 */

import { getDb, getRawDb } from "../src/db/client.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEMORY_DIR = path.join(__dirname, "../.gnb-memory");

const GDRIVE_FOLDER_ID = "1gm_uMsdDMlkgb1nqNcw3qlYNexl5Nu7T";

async function main() {
  getDb(MEMORY_DIR); // initialise connection + migrations
  const db = getRawDb()!; // raw better-sqlite3 for prepare()

  // ─── Organizations (INSERT OR IGNORE — same as Салтыковка) ───────────────────
  console.log("=== Organizations (reuse) ===");
  const orgs = [
    {
      id: "org-mks",
      name: "МКС – филиал ПАО «Россети Московский регион»",
      short_name: "МКС",
      ogrn: "1057746555811", inn: "5036065113",
      legal_address: "115035, г. Москва, ул. Садовническая, д.36",
      aosr_block: "МКС – филиал ПАО «Россети Московский регион» ОГРН 1057746555811, ИНН 5036065113, 115035, г. Москва, ул. Садовническая, д.36 , тел.: 8 (495) 668-22-28 СРО СОЮЗ «ЭНЕРГОСТРОЙ», ОГРН 1097799013751, ИНН 7708237433",
    },
    {
      id: "org-smk",
      name: "ООО «СМК»",
      short_name: "СМК",
      ogrn: "1167154074570", inn: "7130031154",
      legal_address: "153510, Ивановская область, г. Кохма, ул. Октябрьская, дом 49а, этаж 2, помещение №1",
      aosr_block: "ООО «СМК» ОГРН 1167154074570, ИНН 7130031154, 153510, Ивановская область, г. Кохма, ул. Октябрьская, дом 49а, этаж 2, помещение №1, тел. 8-499-288-00-98; СРО-С-114-16122009 от 14.06.2019г.",
    },
    {
      id: "org-skmgrupp",
      name: "ООО «СКМ-ГРУПП»",
      short_name: "СКМ-ГРУПП",
      ogrn: "5167746459579", inn: "9723046395",
      legal_address: "125481 г. Москва, ул. Свободы, д.103, стр.10 комн.4",
      aosr_block: "ООО «СКМ-ГРУПП» ОГРН 5167746459579, ИНН 9723046395, 125481 г. Москва, ул. Свободы, д.103, стр.10 комн.4 тел. +7 499 755-60-20; СРО Ассоциация СРО «ЭкспертСтрой» ОГРН 1127799010668 ИНН 7708240612",
    },
  ];
  for (const o of orgs) {
    db.prepare(`
      INSERT OR IGNORE INTO organizations (id, name, short_name, ogrn, inn, legal_address, aosr_block, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(o.id, o.name, o.short_name, o.ogrn, o.inn, o.legal_address, o.aosr_block);
    console.log(`  ✓ ${o.short_name}`);
  }

  // ─── Customer ────────────────────────────────────────────────────────────────
  console.log("\n=== Customer ===");
  db.prepare(`
    INSERT OR IGNORE INTO customers (id, name, org_id, created_at)
    VALUES ('customer-mks', 'МКС – филиал ПАО «Россети Московский регион»', 'org-mks', datetime('now'))
  `).run();
  console.log("  ✓ customer-mks");

  // ─── Object ──────────────────────────────────────────────────────────────────
  console.log("\n=== Object ===");
  db.prepare(`
    INSERT OR IGNORE INTO objects (id, customer_id, short_name, official_name, default_address, created_at, updated_at)
    VALUES (
      'obj-lesnoryadskaya',
      'customer-mks',
      'Леснорядская',
      'ул. Лесной Ряд',
      'г. Москва, ул. Лесной Ряд',
      datetime('now'), datetime('now')
    )
  `).run();
  const obj = db.prepare("SELECT * FROM objects WHERE id = 'obj-lesnoryadskaya'").get() as any;
  console.log(`  ✓ ${obj.short_name} (${obj.id})`);

  // ─── People (INSERT OR IGNORE) ───────────────────────────────────────────────
  console.log("\n=== People (reuse from Салтыковка) ===");
  const people = [
    { id: "person-gusev",        full_name: "Гусев П.А.",      surname: "Гусев",        org_id: "org-mks",      position: "Зам. начальника УКС ЮВО МКС",                    position_long: "Заместитель начальника УКС ЮВО МКС филиал ПАО «РОССЕТИ МОСКОВСКИЙ РЕГИОН»",                       aosr_full_line: "Заместитель начальника УКС ЮВО МКС филиал ПАО «РОССЕТИ МОСКОВСКИЙ РЕГИОН» Гусев П.А." },
    { id: "person-ryashchikov",  full_name: "Рящиков М.Ю.",     surname: "Рящиков",      org_id: "org-mks",      position: "Старший мастер 7 РЭР УКС ЮВО МКС",               position_long: "Старший мастер 7 РЭР УКС ЮВО МКС филиал ПАО «РОССЕТИ МОСКОВСКИЙ РЕГИОН»",                       aosr_full_line: "Старший мастер 7 РЭР УКС ЮВО МКС филиал ПАО «РОССЕТИ МОСКОВСКИЙ РЕГИОН» Рящиков М.Ю., распоряжение №1399р от 01.07.2025г." },
    { id: "person-proshin",      full_name: "Прошин Н.Н.",      surname: "Прошин",       org_id: "org-smk",      position: "Зам. ген. директора по развитию ООО «СМК»",       position_long: "Заместитель генерального директора по развитию ООО «СМК»",                                      aosr_full_line: "Заместитель генерального директора по развитию ООО «СМК» Прошин Н.Н., ИНРС в области строительства С-71-081355 от 21.08.2017г.; приказ №18-ЛНА от 09.01.2019г." },
    { id: "person-tishkov",      full_name: "Тишков В.А.",      surname: "Тишков",       org_id: "org-smk",      position: "Зам. начальника ПТО ООО «СМК»",                   position_long: "Заместитель начальника ПТО ООО «СМК»",                                                         aosr_full_line: "Зам. начальника ПТО ООО «СМК» Тишков В.А., С-77-233823 от 25.05.2021г.; приказ №18-ЛНА 1 от 03.11.2020г." },
    { id: "person-sergeev",      full_name: "Сергеев А.А.",     surname: "Сергеев",      org_id: "org-smk",      position: "ГИП ООО «СМК»",                                   position_long: "Главный инженер проекта ООО «СМК»",                                                            aosr_full_line: "ГИП ООО «СМК» Сергеев А.А., индетификационный номер в НРС в НОПРИЗ ПИ-125535 от 19.02.2021г; Приказ №27-ЛНА от 03.02.2022г." },
    { id: "person-kartavchenko", full_name: "Картавченко А.Л.", surname: "Картавченко",  org_id: "org-skmgrupp", position: "Главный инженер ООО «СКМ-ГРУПП»",                  position_long: "Главный инженер ООО «СКМ-ГРУПП»",                                                              aosr_full_line: "Главный инженер ООО «СКМ-ГРУПП» Картавченко А.Л., Приказ №25-11-03-1 от 03.11.2023 г." },
  ];
  for (const p of people) {
    db.prepare(`
      INSERT OR IGNORE INTO people (id, full_name, surname, position, position_long, org_id, aosr_full_line, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
    `).run(p.id, p.full_name, p.surname, p.position, p.position_long, p.org_id, p.aosr_full_line);
    console.log(`  ✓ ${p.full_name} (${p.org_id})`);
  }

  // ─── Summary ─────────────────────────────────────────────────────────────────
  const counts = {
    orgs: (db.prepare("SELECT COUNT(*) as n FROM organizations").get() as any).n,
    people: (db.prepare("SELECT COUNT(*) as n FROM people").get() as any).n,
    objects: (db.prepare("SELECT COUNT(*) as n FROM objects").get() as any).n,
  };
  console.log(`
✅ Готово:
   Orgs: ${counts.orgs}  People: ${counts.people}  Objects: ${counts.objects}

   Леснорядская (obj-lesnoryadskaya)
   GDrive: https://drive.google.com/drive/folders/${GDRIVE_FOLDER_ID}

⏳ Следующий шаг: скинь акт МКС АОСР+РЭР → /process-act
`);
}

main().catch(e => { console.error("❌", e.message ?? e); process.exit(1); });
