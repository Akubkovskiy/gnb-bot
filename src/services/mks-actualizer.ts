/**
 * MKS act actualizer — compares a parsed МКС АОСР+РЭР act against the DB.
 *
 * Produces a human-readable report:
 *   • New people not yet in DB
 *   • Changed ИНРС/НРС numbers or orders (with dates)
 *   • Order date vs work dates consistency check
 *   • New organizations
 *
 * Also provides an `applyUpdates` function that writes detected changes to DB.
 */
import { sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "../db/schema.js";
import type { ParsedMksAct, ParsedPerson } from "../intake/mks-act-parser.js";
import { serialToDate } from "../intake/mks-act-parser.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Db = BetterSQLite3Database<typeof schema>;

interface DbPerson {
  id: string;
  full_name: string;
  surname: string;
  position: string | null;
  position_long: string | null;
  org_id: string | null;
  aosr_full_line: string | null;
}

interface DbDoc {
  id: number;
  doc_type: string;
  doc_number: string | null;
  doc_date: string | null;
  role_granted: string | null;
  is_current: number;
}

export type FindingKind =
  | "new_person"
  | "inrs_changed"
  | "order_changed"
  | "order_date_before_work"
  | "new_org"
  | "position_changed";

export interface ActualizationFinding {
  kind: FindingKind;
  role: string;
  person_name: string;
  message: string;
  /** If true, this is a warning rather than an informational note */
  warning: boolean;
  /** Proposed DB change if owner confirms */
  proposed?: {
    person_id?: string;
    update_type: "upsert_person" | "upsert_doc" | "upsert_org";
    data: Record<string, unknown>;
  };
}

export interface ActualizationResult {
  findings: ActualizationFinding[];
  summary: string;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function actualizeMksAct(
  db: Db,
  act: ParsedMksAct,
): Promise<ActualizationResult> {
  const findings: ActualizationFinding[] = [];

  const workStart = act.date_start_serial ? serialToDate(act.date_start_serial) : null;

  const roles: Array<{ label: string; person: ParsedPerson }> = [
    { label: "МКС представитель", person: act.mks_rep },
    { label: "Подрядчик-1 (строй контроль)", person: act.contractor1 },
    { label: "Подрядчик-2", person: act.contractor2 },
    { label: "Проектировщик (ГИП)", person: act.designer_rep },
    { label: "Представитель исполнителя", person: act.executor_rep },
    { label: "РЭР", person: act.rer_rep },
  ];

  for (const { label, person } of roles) {
    if (!person.short_name && !person.line1) continue;

    const dbPerson = await findPersonBySurname(db, person.short_name || person.name || "");

    if (!dbPerson) {
      // New person — not in DB
      findings.push({
        kind: "new_person",
        role: label,
        person_name: person.short_name || person.name || person.line1,
        message: `👤 Новый человек: **${person.short_name || person.name}** (${label}) — не найден в базе`,
        warning: false,
        proposed: {
          update_type: "upsert_person",
          data: {
            full_name: person.short_name || person.name || "",
            position_long: person.position || "",
            aosr_full_line: person.line1,
            inrs: person.inrs,
            order: person.order,
          },
        },
      });
      continue;
    }

    // Person found — compare documents
    const docs = await getPersonDocs(db, dbPerson.id);
    const inrsDocs = docs.filter((d) =>
      ["ИНРС", "НРС-НОПРИЗ", "НРС", "ИНРС-НОПРИЗ"].includes(d.doc_type) && d.is_current,
    );
    const orderDocs = docs.filter((d) =>
      ["приказ", "распоряжение"].includes(d.doc_type) && d.is_current,
    );

    // ИНРС check
    if (person.inrs) {
      const inrsNumber = extractDocNumber(person.inrs);
      const dbInrs = inrsDocs[0];
      if (!dbInrs) {
        findings.push({
          kind: "inrs_changed",
          role: label,
          person_name: person.short_name || "",
          message: `📋 ${person.short_name}: ИНРС **${inrsNumber}** — в базе нет, в акте есть`,
          warning: false,
          proposed: {
            person_id: dbPerson.id,
            update_type: "upsert_doc",
            data: { doc_type: "ИНРС", doc_number: inrsNumber, doc_date: extractDocDate(person.inrs) },
          },
        });
      } else if (dbInrs.doc_number && inrsNumber && normalizeDocNum(dbInrs.doc_number) !== normalizeDocNum(inrsNumber)) {
        findings.push({
          kind: "inrs_changed",
          role: label,
          person_name: person.short_name || "",
          message: `⚠️ ${person.short_name}: ИНРС изменился — в базе **${dbInrs.doc_number}**, в акте **${inrsNumber}**`,
          warning: true,
        });
      }
    }

    // Order / приказ check
    if (person.order) {
      const orderNumber = extractDocNumber(person.order);
      const orderDate = extractDocDate(person.order);
      const dbOrder = orderDocs[0];

      if (!dbOrder) {
        findings.push({
          kind: "order_changed",
          role: label,
          person_name: person.short_name || "",
          message: `📋 ${person.short_name}: приказ **${orderNumber}** — в базе нет, в акте есть`,
          warning: false,
          proposed: {
            person_id: dbPerson.id,
            update_type: "upsert_doc",
            data: {
              doc_type: person.order.match(/^распоряжение/i) ? "распоряжение" : "приказ",
              doc_number: orderNumber,
              doc_date: orderDate,
            },
          },
        });
      } else if (dbOrder.doc_number && orderNumber && normalizeDocNum(dbOrder.doc_number) !== normalizeDocNum(orderNumber)) {
        findings.push({
          kind: "order_changed",
          role: label,
          person_name: person.short_name || "",
          message: `🔄 ${person.short_name}: приказ изменился — в базе **${dbOrder.doc_number}** (${dbOrder.doc_date ?? "?"}), в акте **${orderNumber}** (${orderDate ?? "?"})`,
          warning: false,
          proposed: {
            person_id: dbPerson.id,
            update_type: "upsert_doc",
            data: {
              doc_type: person.order.match(/^распоряжение/i) ? "распоряжение" : "приказ",
              doc_number: orderNumber,
              doc_date: orderDate,
            },
          },
        });
      }

      // Date sanity: order must predate work start
      if (workStart && orderDate) {
        const od = parseRuDate(orderDate);
        if (od && od > workStart) {
          findings.push({
            kind: "order_date_before_work",
            role: label,
            person_name: person.short_name || "",
            message:
              `🚨 ${person.short_name}: приказ №${orderNumber} датирован **${orderDate}**, ` +
              `но работы начались **${formatDate(workStart)}** — приказ выдан ПОСЛЕ начала работ!`,
            warning: true,
          });
        }
      }
    }

    // Position changed
    if (person.position && dbPerson.position_long) {
      if (normalize(person.position) !== normalize(dbPerson.position_long)) {
        findings.push({
          kind: "position_changed",
          role: label,
          person_name: person.short_name || "",
          message:
            `ℹ️ ${person.short_name}: должность в акте отличается от базы\n` +
            `  база: _${dbPerson.position_long}_\n` +
            `  акт:  _${person.position}_`,
          warning: false,
        });
      }
    }
  }

  // Organization checks (basic: detect if org name is not in DB)
  const orgChecks = [
    { label: "Подрядчик", name: act.contractor_org_name },
    { label: "Проектировщик", name: act.designer_org_name },
    { label: "Исполнитель", name: act.executor_org_name },
  ];
  for (const { label, name } of orgChecks) {
    if (!name) continue;
    const exists = await orgExistsByName(db, name);
    if (!exists) {
      findings.push({
        kind: "new_org",
        role: label,
        person_name: "",
        message: `🏢 Новая организация: **${name.trim()}** (${label}) — не найдена в базе`,
        warning: false,
        proposed: {
          update_type: "upsert_org",
          data: { name: name.trim() },
        },
      });
    }
  }

  // Build summary
  const warnings = findings.filter((f) => f.warning).length;
  const infos = findings.filter((f) => !f.warning).length;

  let summary = `📊 Анализ акта: **${act.transition_number?.trim() || "?"}**`;
  if (act.object_title) summary += ` — ${act.object_title.slice(0, 60).trim()}...`;
  summary += "\n\n";

  if (findings.length === 0) {
    summary += "✅ Все данные в базе актуальны. Расхождений нет.";
  } else {
    if (warnings > 0) summary += `🚨 Предупреждений: ${warnings}\n`;
    if (infos > 0) summary += `ℹ️ Замечаний: ${infos}\n`;
    summary += "\n" + findings.map((f) => f.message).join("\n\n");
  }

  return { findings, summary };
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

async function findPersonBySurname(db: Db, shortName: string): Promise<DbPerson | null> {
  if (!shortName) return null;
  // Extract surname (first word)
  const surname = shortName.split(/[\s,]+/)[0];
  if (!surname || surname.length < 2) return null;

  const rows = await db.all<DbPerson>(sql`
    SELECT id, full_name, surname, position, position_long, org_id, aosr_full_line
    FROM people
    WHERE LOWER(surname) = LOWER(${surname})
      AND is_active = 1
    LIMIT 1
  `);
  return rows[0] ?? null;
}

async function getPersonDocs(db: Db, personId: string): Promise<DbDoc[]> {
  return db.all<DbDoc>(sql`
    SELECT id, doc_type, doc_number, doc_date, role_granted, is_current
    FROM person_documents
    WHERE person_id = ${personId}
  `);
}

async function orgExistsByName(db: Db, name: string): Promise<boolean> {
  const trimmed = name.trim();
  // SQLite LOWER() doesn't handle Cyrillic — use LIKE for partial match
  const rows = await db.all<{ n: number }>(sql`
    SELECT COUNT(*) as n FROM organizations
    WHERE TRIM(name) = ${trimmed}
       OR TRIM(short_name) = ${trimmed}
       OR name LIKE ${"%" + trimmed.replace(/[«»""]/g, "") + "%"}
  `);
  return (rows[0]?.n ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Write updates to DB
// ---------------------------------------------------------------------------

export async function applyActualizationUpdates(
  db: Db,
  findings: ActualizationFinding[],
): Promise<string[]> {
  const applied: string[] = [];

  for (const finding of findings) {
    if (!finding.proposed) continue;
    const { update_type, data, person_id } = finding.proposed;

    if (update_type === "upsert_doc" && person_id) {
      // Mark existing same-type docs as not current
      await db.run(sql`
        UPDATE person_documents
        SET is_current = 0
        WHERE person_id = ${person_id}
          AND doc_type = ${data.doc_type as string}
          AND is_current = 1
      `);
      // Insert new current doc
      await db.run(sql`
        INSERT INTO person_documents (person_id, doc_type, doc_number, doc_date, role_granted, is_current, created_at)
        VALUES (${person_id}, ${data.doc_type as string}, ${data.doc_number as string ?? null},
                ${data.doc_date as string ?? null}, ${null}, 1, datetime('now'))
      `);
      applied.push(`Обновлён документ ${data.doc_type} для ${finding.person_name}`);
    }

    if (update_type === "upsert_person") {
      // Basic insert of new person (id generated from name)
      const rawName = String(data.full_name ?? "");
      const newId = `person-${rawName.toLowerCase().replace(/[^а-яёa-z0-9]/gi, "-").slice(0, 30)}`;
      const surname = rawName.split(/[\s,]+/)[0] || rawName;
      await db.run(sql`
        INSERT OR IGNORE INTO people
          (id, full_name, surname, position, position_long, aosr_full_line, is_active, created_at, updated_at)
        VALUES
          (${newId}, ${rawName}, ${surname},
           ${data.position_long as string ?? null}, ${data.position_long as string ?? null},
           ${data.aosr_full_line as string ?? null},
           1, datetime('now'), datetime('now'))
      `);
      applied.push(`Добавлен новый человек: ${rawName}`);
    }
  }

  return applied;
}

// ---------------------------------------------------------------------------
// String helpers
// ---------------------------------------------------------------------------

function extractDocNumber(str: string): string | undefined {
  if (!str) return undefined;

  // Pattern 1: after "№" sign — grab alphanumeric-dash token, optionally " N" suffix
  // e.g. "приказ №18-ЛНА", "№1399р", "№18-ЛНА 1", "ИНРС №С-77-204102"
  const hashMatch = str.match(/[№#]\s*([A-ZА-ЯЁa-zа-яё0-9][A-ZА-ЯЁa-zа-яё0-9\-\/]+(?:\s+\d+)?)/);
  if (hashMatch) return hashMatch[1].trim();

  // Pattern 2: free-standing ИНРС/НРС codes (no preceding №)
  // "С-77-204102", "С-71-081355" → letter-hyphen-2digits-hyphen-digits
  const latinCyrCode = str.match(/(?:^|[\s,;])([A-Za-zА-ЯЁа-яё]{1,2}-\d{2}-\d+)/);
  if (latinCyrCode) return latinCyrCode[1].trim();

  // Pattern 3: ПИ-XXXXXX style (НОПРИЗ НРС project engineer codes)
  const piMatch = str.match(/(?:^|[\s,;])(ПИ-\d+)/i);
  if (piMatch) return piMatch[1].trim();

  // Pattern 4: order code after keyword — e.g. "приказ 18-ЛНА 1"
  // Strip leading keywords, grab first token
  const afterKeyword = str.replace(
    /^(?:ИНРС|НРС|приказ|распоряжение|индетификационный|номер|в|области|строительства)(?:\s+(?:ИНРС|НРС|номер|в|областиstроительства|НОПРИЗ))*/i, ""
  ).trim();
  const tokenMatch = afterKeyword.match(/^([A-ZА-ЯЁa-zа-яё0-9][A-ZА-ЯЁa-zа-яё0-9\-\/]*(?:\s+\d+)?)/);
  if (tokenMatch?.[1] && tokenMatch[1].length > 1 && !/^(от|по|для|до)$/i.test(tokenMatch[1])) {
    return tokenMatch[1].trim();
  }

  return undefined;
}

function extractDocDate(str: string): string | undefined {
  const m = str.match(/(\d{2}\.\d{2}\.\d{4})/);
  return m?.[1];
}

function normalizeDocNum(s: string): string {
  return s
    .replace(/\s+от\s+\d{2}\.\d{2}\.\d{4}.*/i, "") // strip trailing " от DD.MM.YYYY..."
    .replace(/\s+от\s+\d+.*/i, "")                  // strip trailing " от NN..."
    .replace(/[№#\s«»"']/g, "")
    .toLowerCase();
}

function normalize(s: string): string {
  return s
    .replace(/[«»""„"]/g, '"')       // normalize quotes
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

function parseRuDate(str: string): Date | null {
  const m = str.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}
