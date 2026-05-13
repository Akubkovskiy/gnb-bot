/**
 * Seed: Салтыковская — customer + object + transition №1 + signatories + materials.
 *
 * Requires: seed-saltykova.ts must have run first (orgs + people in DB).
 *
 * Idempotent: INSERT OR REPLACE on all records.
 *
 * Run: npx tsx scripts/seed-saltykova-transition.ts
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
  // Customer — МКС (Московские кабельные сети)
  // ---------------------------------------------------------------------------
  console.log("=== Seeding customer ===");
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
    INSERT OR REPLACE INTO customer_aliases (customer_id, alias)
    VALUES
      ('customer-mks', 'МКС'),
      ('customer-mks', 'Россети МР'),
      ('customer-mks', 'Московские кабельные сети')
    ON CONFLICT(customer_id, alias) DO NOTHING
  `);
  console.log("  ✓ МКС");

  // ---------------------------------------------------------------------------
  // Object — Салтыковская ул. д.5А
  // ---------------------------------------------------------------------------
  console.log("\n=== Seeding object ===");
  await db.run(sql`
    INSERT OR REPLACE INTO objects
      (id, customer_id, short_name, official_name, title_line, default_address, default_project_number, created_at, updated_at)
    VALUES
      ('object-saltykova',
       'customer-mks',
       'Салтыковская д.5А',
       'Салтыковская ул. д.5А',
       '«Строительство 8КЛ-0,4 кВ от ТП-10/0,4кВ № 22172 до ВРУ-0,4кВ №1 Заявителя, в т.ч. ПИР: г.Москва, ул. Салтыковская, д.5А»',
       'г. Москва, Салтыковская ул. д.5А',
       '345716/ПС-25',
       datetime('now'), datetime('now'))
  `);
  console.log("  ✓ Салтыковская д.5А");

  // ---------------------------------------------------------------------------
  // Materials
  // ---------------------------------------------------------------------------
  console.log("\n=== Seeding materials ===");

  const materials = [
    {
      id: "mat-electropipe-160",
      material_type: "pipe",
      name: "ЭЛЕКТРОПАЙП ОС РС 160х8.9 SN16-N F90 T120",
      manufacturer: "ЭЛЕКТРОПАЙП",
      specifications: "ПЭ100, SN16, d160x8.9мм, F90, T120",
    },
    {
      id: "mat-bentopro-standart",
      material_type: "bentonite",
      name: "Глинопорошок бентонитовый для горизонтального бурения «Bentopro standart»",
      manufacturer: "BentoPro",
      specifications: "сертификат соответствия: RU.32468.04ЛЕГО.010.3869",
    },
    {
      id: "mat-bentopro-phpa",
      material_type: "polymer",
      name: "Ингибитор глины «BentoPro PHPA»",
      manufacturer: "BentoPro",
      specifications: null,
    },
    {
      id: "mat-ukpt-175-55",
      material_type: "plugs",
      name: "Заглушки УКПТ 175/55",
      manufacturer: null,
      specifications: null,
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
    console.log(`  ✓ ${m.name.slice(0, 50)}`);
  }

  // ---------------------------------------------------------------------------
  // Transition №1 — Салтыковская
  // ---------------------------------------------------------------------------
  console.log("\n=== Seeding transition ===");

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
      ('trans-saltykova-1',
       'object-saltykova',
       '№1', '1', 'finalized',
       'г. Москва, Салтыковская ул. д.5А',
       '345716/ПС-25',
       '«Строительство 8КЛ-0,4 кВ от ТП-10/0,4кВ № 22172 до ВРУ-0,4кВ №1 Заявителя»',
       'org-skmgrupp',
       '2025-10-27', '2025-10-31', '2025-10-31',
       63.64, 63.64,
       3, 160.0, 500.0,
       'ЭЛЕКТРОПАЙП ОС РС 160х8.9 SN16-N F90 T120',
       'Паспорт качества №12514 от 09.10.2025г; Сертификат соответствия №РОСС RU.HB24.АПТС H00165/24 до 20.02.2029г.',
       datetime('now'), datetime('now'), '2025-10-31T00:00:00Z')
  `);
  console.log("  ✓ Переход №1 (27.10–31.10.2025, 63.64м)");

  // ---------------------------------------------------------------------------
  // Transition organizations
  // ---------------------------------------------------------------------------
  console.log("\n=== Seeding transition_orgs ===");

  const transOrgs = [
    { role: "customer",    org_id: "org-mks" },
    { role: "contractor",  org_id: "org-smk" },
    { role: "designer",    org_id: "org-smk" },
    { role: "executor",    org_id: "org-skmgrupp" },
  ];

  for (const to of transOrgs) {
    await db.run(sql`
      INSERT OR REPLACE INTO transition_orgs
        (transition_id, role, org_id)
      VALUES ('trans-saltykova-1', ${to.role}, ${to.org_id})
    `);
    console.log(`  ✓ ${to.role} → ${to.org_id}`);
  }

  // ---------------------------------------------------------------------------
  // Transition signatories (6 roles from МКС АОСР template)
  // ---------------------------------------------------------------------------
  console.log("\n=== Seeding transition_signatories ===");

  // Clear existing first (idempotent)
  await db.run(sql`
    DELETE FROM transition_signatories WHERE transition_id = 'trans-saltykova-1'
  `);

  const signatories = [
    {
      role: "mks_rep",
      person_id: "person-gusev",
      org_id: "org-mks",
      position_override: "Заместитель начальника УКС ЮВО МКС филиал ПАО «РОССЕТИ МОСКОВСКИЙ РЕГИОН»",
    },
    {
      role: "contractor1",        // строительный контроль
      person_id: "person-proshin",
      org_id: "org-smk",
      position_override: "Заместитель генерального директора по развитию ООО «СМК»",
    },
    {
      role: "contractor2",        // выполнял работы
      person_id: "person-tishkov",
      org_id: "org-smk",
      position_override: "Заместитель начальника ПТО ООО «СМК»",
    },
    {
      role: "designer_rep",
      person_id: "person-sergeev",
      org_id: "org-smk",
      position_override: "Главный инженер проекта ООО «СМК»",
    },
    {
      role: "executor_rep",
      person_id: "person-kartavchenko",
      org_id: "org-skmgrupp",
      position_override: "Главный инженер ООО «СКМ-ГРУПП»",
    },
    {
      role: "rer_rep",
      person_id: "person-ryashchikov",
      org_id: "org-mks",
      position_override: "Старший мастер 7 РЭР УКС ЮВО МКС филиал ПАО «РОССЕТИ МОСКОВСКИЙ РЕГИОН»",
    },
  ];

  for (const s of signatories) {
    await db.run(sql`
      INSERT INTO transition_signatories
        (transition_id, role, person_id, org_id, position_override, created_at)
      VALUES
        ('trans-saltykova-1', ${s.role}, ${s.person_id}, ${s.org_id},
         ${s.position_override ?? null}, datetime('now'))
    `);
    console.log(`  ✓ ${s.role} → ${s.person_id}`);
  }

  // ---------------------------------------------------------------------------
  // Transition materials
  // ---------------------------------------------------------------------------
  console.log("\n=== Seeding transition_materials ===");

  await db.run(sql`
    DELETE FROM transition_materials WHERE transition_id = 'trans-saltykova-1'
  `);

  const transMaterials = [
    { material_id: "mat-electropipe-160",   quantity: "3 трубы × 63.64м = 190.92м",  notes: "Паспорт качества №12514 от 09.10.2025" },
    { material_id: "mat-bentopro-standart", quantity: "6715 л",                        notes: null },
    { material_id: "mat-bentopro-phpa",     quantity: "345 л",                         notes: null },
    { material_id: "mat-ukpt-175-55",       quantity: null,                             notes: "Финальное расширение 500мм" },
  ];

  for (const tm of transMaterials) {
    await db.run(sql`
      INSERT INTO transition_materials
        (transition_id, material_id, quantity, notes, created_at)
      VALUES
        ('trans-saltykova-1', ${tm.material_id}, ${tm.quantity ?? null}, ${tm.notes ?? null}, datetime('now'))
    `);
    console.log(`  ✓ ${tm.material_id}`);
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  const counts = {
    customers: await db.get<{ n: number }>(sql`SELECT COUNT(*) as n FROM customers`),
    objects:   await db.get<{ n: number }>(sql`SELECT COUNT(*) as n FROM objects`),
    trans:     await db.get<{ n: number }>(sql`SELECT COUNT(*) as n FROM transitions`),
    sigs:      await db.get<{ n: number }>(sql`SELECT COUNT(*) as n FROM transition_signatories`),
    mats:      await db.get<{ n: number }>(sql`SELECT COUNT(*) as n FROM materials`),
  };

  console.log(
    `\n✅ DB: ${counts.customers?.n} customers, ${counts.objects?.n} objects, ` +
    `${counts.trans?.n} transitions, ${counts.sigs?.n} signatories, ${counts.mats?.n} materials`,
  );

  process.exit(0);
}

main().catch((e) => {
  console.error("❌ Error:", e.message ?? e);
  process.exit(1);
});
