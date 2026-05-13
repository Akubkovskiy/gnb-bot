/**
 * Knowledge Base Query Service
 *
 * Parses a user message for DB references (transitions, people, objects, materials),
 * fetches data from SQLite, and returns a formatted context block for Claude.
 *
 * Also tracks an active "conversation context" so follow-up questions
 * ("кто там был", "какие материалы") work without repeating the object/GNB.
 */
import { sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "../db/schema.js";

type Db = BetterSQLite3Database<typeof schema>;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KbContext {
  /** Formatted text to inject into Claude's system prompt */
  contextText: string;
  /** IDs of the primary entity this context describes */
  activeTransitionId?: string;
  activeObjectId?: string;
  activePersonId?: string;
  /** True if we found anything relevant */
  found: boolean;
}

export interface ConversationContext {
  activeTransitionId?: string;
  activeObjectId?: string;
  activePersonId?: string;
  updatedAt: number;
}

// In-memory session store (keyed by Telegram chatId)
const sessions = new Map<number, ConversationContext>();

export function getConversationContext(chatId: number): ConversationContext | undefined {
  const s = sessions.get(chatId);
  if (!s) return undefined;
  // Expire after 30 minutes of inactivity
  if (Date.now() - s.updatedAt > 30 * 60 * 1000) {
    sessions.delete(chatId);
    return undefined;
  }
  return s;
}

export function setConversationContext(chatId: number, ctx: Partial<ConversationContext>) {
  const existing = sessions.get(chatId) ?? { updatedAt: 0 };
  sessions.set(chatId, { ...existing, ...ctx, updatedAt: Date.now() });
}

export function clearConversationContext(chatId: number) {
  sessions.delete(chatId);
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Document retrieval
// ---------------------------------------------------------------------------

export async function findDocumentsForEntity(
  db: Db,
  linkType: string,
  targetId: string,
  docType?: string,
): Promise<Array<{
  id: string;
  doc_type: string;
  original_filename: string | null;
  file_path: string | null;
  doc_number: string | null;
  doc_date: string | null;
}>> {
  if (docType) {
    return db.all<{
      id: string;
      doc_type: string;
      original_filename: string | null;
      file_path: string | null;
      doc_number: string | null;
      doc_date: string | null;
    }>(sql`
      SELECT d.id, d.doc_type, d.original_filename, d.file_path, d.doc_number, d.doc_date
      FROM documents d
      JOIN document_links dl ON dl.document_id = d.id
      WHERE dl.link_type = ${linkType} AND dl.target_id = ${targetId}
        AND d.file_path IS NOT NULL
        AND d.doc_type = ${docType}
      ORDER BY d.created_at DESC
    `);
  }
  return db.all<{
    id: string;
    doc_type: string;
    original_filename: string | null;
    file_path: string | null;
    doc_number: string | null;
    doc_date: string | null;
  }>(sql`
    SELECT d.id, d.doc_type, d.original_filename, d.file_path, d.doc_number, d.doc_date
    FROM documents d
    JOIN document_links dl ON dl.document_id = d.id
    WHERE dl.link_type = ${linkType} AND dl.target_id = ${targetId}
      AND d.file_path IS NOT NULL
    ORDER BY d.created_at DESC
  `);
}

export async function buildKbContext(
  db: Db,
  userMessage: string,
  chatId: number,
): Promise<KbContext> {
  const lower = userMessage.toLowerCase();
  const prior = getConversationContext(chatId);

  // --- 1. Detect explicit GNB / transition reference ---
  const gnbNum = extractGnbNumber(lower);

  // --- 2. Detect object / address reference ---
  const objectHint = extractObjectHint(lower);

  // --- 3. Detect person surname reference ---
  const surnameHint = extractSurnameHint(lower);

  // --- 4. Detect material / equipment reference ---
  const materialHint = extractMaterialHint(lower);

  // --- 5. Detect follow-up patterns ("там", "он", "она", "этот", "там кто") ---
  const isFollowUp = detectFollowUp(lower);

  // If pure follow-up and we have prior context — use it
  if (isFollowUp && prior && !gnbNum && !objectHint && !surnameHint && !materialHint) {
    return buildContextFromPrior(db, prior, chatId);
  }

  // If we have a GNB number or object hint — look up transition
  if (gnbNum || objectHint) {
    const transition = await findTransition(db, gnbNum, objectHint);
    if (transition) {
      const ctx = await buildTransitionContext(db, transition.id);
      setConversationContext(chatId, {
        activeTransitionId: transition.id,
        activeObjectId: transition.object_id,
      });
      return ctx;
    }
  }

  // If we have a surname hint — look up person
  if (surnameHint) {
    const person = await findPerson(db, surnameHint);
    if (person) {
      const ctx = await buildPersonContext(db, person.id);
      setConversationContext(chatId, { activePersonId: person.id });
      return ctx;
    }
  }

  // If material hint — look up materials
  if (materialHint) {
    const ctx = await buildMaterialContext(db, materialHint);
    if (ctx.found) return ctx;
  }

  // If prior context and message seems DB-related — use prior
  if (prior && isDbRelatedQuestion(lower)) {
    return buildContextFromPrior(db, prior, chatId);
  }

  return { contextText: "", found: false };
}

// ---------------------------------------------------------------------------
// Context builders
// ---------------------------------------------------------------------------

async function buildContextFromPrior(
  db: Db,
  prior: ConversationContext,
  chatId: number,
): Promise<KbContext> {
  if (prior.activeTransitionId) {
    return buildTransitionContext(db, prior.activeTransitionId);
  }
  if (prior.activePersonId) {
    return buildPersonContext(db, prior.activePersonId);
  }
  if (prior.activeObjectId) {
    const trans = await db.all<{ id: string }>(sql`
      SELECT id FROM transitions WHERE object_id = ${prior.activeObjectId}
      ORDER BY created_at DESC LIMIT 1
    `);
    if (trans[0]) return buildTransitionContext(db, trans[0].id);
  }
  return { contextText: "", found: false };
}

async function buildTransitionContext(db: Db, transitionId: string): Promise<KbContext> {
  // Core transition data
  const trans = await db.get<TransitionRow>(sql`
    SELECT t.*, o.short_name as obj_short_name, o.official_name as obj_official_name,
           o.default_address, o.default_project_number
    FROM transitions t
    LEFT JOIN objects o ON o.id = t.object_id
    WHERE t.id = ${transitionId}
  `);
  if (!trans) return { contextText: "", found: false };

  // Signatories
  const sigs = await db.all<SignatoryRow>(sql`
    SELECT ts.role, ts.position_override,
           p.full_name, p.surname, p.position, p.position_long,
           org.short_name as org_short
    FROM transition_signatories ts
    JOIN people p ON p.id = ts.person_id
    LEFT JOIN organizations org ON org.id = ts.org_id
    WHERE ts.transition_id = ${transitionId}
    ORDER BY ts.id
  `);

  // Organizations
  const orgs = await db.all<OrgRow>(sql`
    SELECT to2.role, org.name, org.short_name
    FROM transition_orgs to2
    JOIN organizations org ON org.id = to2.org_id
    WHERE to2.transition_id = ${transitionId}
  `);

  // Materials
  const mats = await db.all<MaterialRow>(sql`
    SELECT m.material_type, m.name, m.specifications, tm.quantity, tm.notes
    FROM transition_materials tm
    JOIN materials m ON m.id = tm.material_id
    WHERE tm.transition_id = ${transitionId}
  `);

  // Documents linked to this transition
  const docs = await db.all<{ doc_type: string; doc_number: string | null; doc_date: string | null }>(sql`
    SELECT d.doc_type, d.doc_number, d.doc_date
    FROM document_links dl
    JOIN documents d ON d.id = dl.document_id
    WHERE dl.link_type = 'transition' AND dl.target_id = ${transitionId}
    ORDER BY d.doc_type
  `);

  // Format
  const lines: string[] = [];

  lines.push(`## Переход из базы данных: ${trans.gnb_number ?? "?"}`);
  lines.push("");
  lines.push(`**Объект:** ${trans.obj_short_name ?? trans.object_id}`);
  if (trans.obj_official_name) lines.push(`**Полное название:** ${trans.obj_official_name}`);
  lines.push(`**Адрес:** ${trans.address ?? trans.default_address ?? "—"}`);
  lines.push(`**Проект:** ${trans.project_number ?? trans.default_project_number ?? "—"}`);
  lines.push(`**Статус:** ${statusRu(trans.status)}`);
  lines.push("");

  lines.push(`**Период работ:** ${fmt(trans.start_date)} — ${fmt(trans.end_date)}`);
  if (trans.act_date) lines.push(`**Дата акта:** ${fmt(trans.act_date)}`);
  lines.push("");

  lines.push(`**Длина ГНБ:** ${trans.profile_length ?? "—"} м`);
  lines.push(`**Трубы:** ${trans.pipe_count ?? "—"} шт, ⌀${trans.pipe_diameter_mm ?? "—"} мм`);
  if (trans.pipe_mark) lines.push(`**Марка трубы:** ${trans.pipe_mark}`);
  if (trans.pipe_quality_passport) lines.push(`**Паспорт трубы:** ${trans.pipe_quality_passport}`);
  if (trans.drill_diameter) lines.push(`**Финальный расширитель:** ${trans.drill_diameter} мм`);
  lines.push("");

  if (mats.length > 0) {
    lines.push("**Материалы:**");
    for (const m of mats) {
      const qty = m.quantity ? ` — ${m.quantity}` : "";
      const spec = m.specifications ? ` (${m.specifications})` : "";
      const note = m.notes ? ` [${m.notes}]` : "";
      lines.push(`  • ${m.name}${qty}${spec}${note}`);
    }
    lines.push("");
  }

  if (orgs.length > 0) {
    lines.push("**Организации:**");
    for (const o of orgs) {
      lines.push(`  • ${roleRu(o.role)}: ${o.name}`);
    }
    lines.push("");
  }

  if (sigs.length > 0) {
    lines.push("**Подписанты:**");
    for (const s of sigs) {
      const pos = s.position_override ?? s.position_long ?? s.position ?? "";
      const org = s.org_short ? ` (${s.org_short})` : "";
      lines.push(`  • ${sigRoleRu(s.role)}: **${s.full_name}**${org}`);
      if (pos) lines.push(`    должность: ${pos}`);
    }
    lines.push("");
  }

  if (docs.length > 0) {
    lines.push("**Документы:**");
    for (const d of docs) {
      lines.push(`  • ${d.doc_type}: ${d.doc_number ?? "—"} от ${d.doc_date ?? "—"}`);
    }
  }

  // Append stored files list
  try {
    const storedFiles = await findDocumentsForEntity(db, "transition", transitionId);
    if (storedFiles.length > 0) {
      lines.push(`\n📎 Файлы: ${storedFiles.map((d) => d.original_filename || d.doc_type).join(", ")}`);
    }
  } catch { /* non-fatal */ }

  return {
    contextText: lines.join("\n"),
    activeTransitionId: transitionId,
    activeObjectId: trans.object_id,
    found: true,
  };
}

async function buildPersonContext(db: Db, personId: string): Promise<KbContext> {
  const person = await db.get<PersonRow>(sql`
    SELECT p.*, org.name as org_name, org.short_name as org_short
    FROM people p
    LEFT JOIN organizations org ON org.id = p.org_id
    WHERE p.id = ${personId}
  `);
  if (!person) return { contextText: "", found: false };

  const docs = await db.all<DocRow>(sql`
    SELECT doc_type, doc_number, doc_date, role_granted, is_current
    FROM person_documents
    WHERE person_id = ${personId}
    ORDER BY is_current DESC, doc_type
  `);

  // Recent transitions this person was involved in
  const history = await db.all<{ transition_id: string; role: string; obj_name: string; gnb_number: string; start_date: string | null }>(sql`
    SELECT ts.transition_id, ts.role, o.short_name as obj_name,
           t.gnb_number, t.start_date
    FROM transition_signatories ts
    JOIN transitions t ON t.id = ts.transition_id
    JOIN objects o ON o.id = t.object_id
    WHERE ts.person_id = ${personId}
    ORDER BY t.start_date DESC
    LIMIT 10
  `);

  const lines: string[] = [];
  lines.push(`## Человек из базы данных: ${person.full_name}`);
  lines.push("");
  lines.push(`**Должность:** ${person.position ?? person.position_long ?? "—"}`);
  if (person.position_long && person.position_long !== person.position) {
    lines.push(`**Полная должность:** ${person.position_long}`);
  }
  lines.push(`**Организация:** ${person.org_name ?? "—"}`);
  lines.push(`**Активен:** ${person.is_active ? "да" : "нет"}`);
  if (person.aosr_full_line) lines.push(`**АОСР строка:** ${person.aosr_full_line}`);
  lines.push("");

  if (docs.length > 0) {
    lines.push("**Документы:**");
    for (const d of docs) {
      const cur = d.is_current ? " ✓" : " (устарел)";
      lines.push(`  • ${d.doc_type}: ${d.doc_number ?? "—"} от ${d.doc_date ?? "—"}${cur}`);
      if (d.role_granted) lines.push(`    роль: ${d.role_granted}`);
    }
    lines.push("");
  }

  if (history.length > 0) {
    lines.push("**Участие в переходах:**");
    for (const h of history) {
      lines.push(`  • ${h.obj_name} ${h.gnb_number} (${fmt(h.start_date)}) — роль: ${sigRoleRu(h.role)}`);
    }
  }

  return {
    contextText: lines.join("\n"),
    activePersonId: personId,
    found: true,
  };
}

async function buildMaterialContext(db: Db, hint: string): Promise<KbContext> {
  const mats = await db.all<{ id: string; material_type: string; name: string; manufacturer: string | null; specifications: string | null }>(sql`
    SELECT id, material_type, name, manufacturer, specifications
    FROM materials
    WHERE LOWER(name) LIKE ${"%" + hint.toLowerCase() + "%"}
       OR LOWER(manufacturer) LIKE ${"%" + hint.toLowerCase() + "%"}
       OR LOWER(material_type) LIKE ${"%" + hint.toLowerCase() + "%"}
    LIMIT 10
  `);

  if (mats.length === 0) return { contextText: "", found: false };

  const lines = ["## Материалы из базы данных", ""];
  for (const m of mats) {
    lines.push(`**${m.name}**`);
    lines.push(`  тип: ${m.material_type}, производитель: ${m.manufacturer ?? "—"}`);
    if (m.specifications) lines.push(`  спецификация: ${m.specifications}`);
  }

  return { contextText: lines.join("\n"), found: true };
}

// ---------------------------------------------------------------------------
// DB finders
// ---------------------------------------------------------------------------

async function findTransition(
  db: Db,
  gnbNum: string | null,
  objectHint: string | null,
): Promise<{ id: string; object_id: string } | null> {
  // Note: SQLite LOWER() doesn't work with Cyrillic — use objectHint as-is (it's already lowercase from the message)
  // and match case-insensitively via LIKE with both case variants where needed.
  // For address/name matching we rely on partial LIKE which works regardless of case for ASCII/digits.

  // Try combined: GNB number + object hint
  if (gnbNum && objectHint) {
    const rows = await db.all<{ id: string; object_id: string }>(sql`
      SELECT t.id, t.object_id FROM transitions t
      LEFT JOIN objects o ON o.id = t.object_id
      WHERE (t.gnb_number LIKE ${"%" + gnbNum + "%"} OR t.gnb_number_short = ${gnbNum})
        AND (o.short_name LIKE ${"%" + objectHint + "%"}
             OR o.official_name LIKE ${"%" + objectHint + "%"}
             OR t.address LIKE ${"%" + objectHint + "%"})
      ORDER BY t.created_at DESC LIMIT 1
    `);
    if (rows[0]) return rows[0];
  }

  // Just GNB number
  if (gnbNum) {
    const rows = await db.all<{ id: string; object_id: string }>(sql`
      SELECT id, object_id FROM transitions
      WHERE gnb_number LIKE ${"%" + gnbNum + "%"}
         OR gnb_number_short = ${gnbNum}
      ORDER BY created_at DESC LIMIT 1
    `);
    if (rows[0]) return rows[0];
  }

  // Just object hint (partial match on address/name)
  if (objectHint) {
    const rows = await db.all<{ id: string; object_id: string }>(sql`
      SELECT t.id, t.object_id FROM transitions t
      LEFT JOIN objects o ON o.id = t.object_id
      WHERE o.short_name LIKE ${"%" + objectHint + "%"}
         OR o.official_name LIKE ${"%" + objectHint + "%"}
         OR t.address LIKE ${"%" + objectHint + "%"}
      ORDER BY t.created_at DESC LIMIT 1
    `);
    if (rows[0]) return rows[0];
  }

  return null;
}

async function findPerson(
  db: Db,
  surname: string,
): Promise<{ id: string } | null> {
  // SQLite LOWER() doesn't handle Cyrillic — capitalize in JS instead
  const cap = surname.charAt(0).toUpperCase() + surname.slice(1);
  const rows = await db.all<{ id: string }>(sql`
    SELECT id FROM people
    WHERE surname LIKE ${cap + "%"}
       OR full_name LIKE ${"%" + cap + "%"}
    ORDER BY is_active DESC LIMIT 1
  `);
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Message parsing helpers
// ---------------------------------------------------------------------------

function extractGnbNumber(text: string): string | null {
  // "ГНБ №3", "переход 3", "гнб 3", "зп1", "ЗП-3", "№1", "переход №2", "gnb 3"
  const patterns = [
    /(?:гнб|gnb|зп|переход)[^\d]*(\d+)/i,
    /[№#]\s*(\d+)/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1];
  }
  return null;
}

function extractObjectHint(text: string): string | null {
  // Russian street/city names, object names
  const knownObjects = [
    "салтыков", "бабушкин", "летчик", "голосенко", "баскаков", "барабаш",
    "тверская", "пресня", "кунцево", "люберц", "котельник",
  ];
  for (const hint of knownObjects) {
    if (text.includes(hint)) return hint;
  }

  // Look for "ул.", "д.", address patterns
  const addrMatch = text.match(/(?:ул[.\s]|улица\s|д[.\s]|дом\s)([а-яёa-z0-9\s]+)/i);
  if (addrMatch) return addrMatch[1].trim().slice(0, 20);

  // "по объекту X" or "на X" patterns
  const objMatch = text.match(/(?:по\s+объекту|на\s+объекте|объект)\s+([а-яёa-z0-9\s]+)/i);
  if (objMatch) return objMatch[1].trim().slice(0, 20);

  return null;
}

function extractSurnameHint(text: string): string | null {
  // Detect Russian surnames (capital-ish names after "кто такой", "по", "про", explicit mention)
  const patterns = [
    /(?:кто такой|кто это|по|про|найди|покажи)\s+([а-яё][а-яё]{2,})/i,
    /(?:барабашов|гусев|прошин|тишков|сергеев|картавченко|рящиков|барабаш|алексеев|жидков)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      // For pattern 1, return capture group; for pattern 0, return full match
      return (m[1] || m[0]).toLowerCase();
    }
  }

  // General "Фамилия П.А." pattern
  const nameMatch = text.match(/\b([А-ЯЁ][а-яё]{3,})\s+[А-ЯЁ]\.[А-ЯЁ]\./);
  if (nameMatch) return nameMatch[1].toLowerCase();

  return null;
}

function extractMaterialHint(text: string): string | null {
  const hints = ["труб", "бентонит", "полимер", "заглушк", "электропайп", "bentopro", "ukpt", "укпт", "материал"];
  for (const h of hints) {
    if (text.includes(h)) return h;
  }
  return null;
}

function detectFollowUp(text: string): boolean {
  const followUpWords = [
    "там", "этот", "этого", "этом", "тот", "того", "него", "неё", "они",
    "там кто", "кто там", "кто подписыв", "кто принимал", "кто был",
    "а материалы", "а длина", "а трубы", "а бентонит", "а дата",
    "расскажи больше", "подробнее", "ещё", "еще", "и что там",
    "а какой", "а когда", "а кто",
  ];
  return followUpWords.some((w) => text.includes(w));
}

function isDbRelatedQuestion(text: string): boolean {
  const dbWords = [
    "принимал", "подписыв", "выполнял", "кто был", "кто там", "длина",
    "материал", "труб", "бентонит", "акт", "аоср", "рэр", "гнб", "переход",
    "проект", "объект", "переход", "диаметр", "паспорт", "сертификат",
  ];
  return dbWords.some((w) => text.includes(w));
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function fmt(date: string | null | undefined): string {
  if (!date) return "—";
  // "2025-10-27" → "27.10.2025"
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  return date;
}

function statusRu(status: string | null | undefined): string {
  if (!status) return "—";
  return status === "finalized" ? "финализирован ✓" : status === "draft" ? "черновик" : status;
}

function roleRu(role: string): string {
  const map: Record<string, string> = {
    customer: "Заказчик", contractor: "Подрядчик", designer: "Проектировщик",
    executor: "Исполнитель", supervisor: "Тех. надзор",
  };
  return map[role] ?? role;
}

function sigRoleRu(role: string): string {
  const map: Record<string, string> = {
    mks_rep: "Представитель МКС (тех.надзор)",
    contractor1: "Строй.контроль",
    contractor2: "Прораб (выполнял работы)",
    designer_rep: "ГИП / Проектировщик",
    executor_rep: "Представитель исполнителя",
    rer_rep: "РЭР (приёмка сетей)",
  };
  return map[role] ?? role;
}

// ---------------------------------------------------------------------------
// Row types (for typed DB queries)
// ---------------------------------------------------------------------------

interface TransitionRow {
  id: string;
  object_id: string;
  obj_short_name: string | null;
  obj_official_name: string | null;
  default_address: string | null;
  default_project_number: string | null;
  gnb_number: string | null;
  gnb_number_short: string | null;
  status: string;
  address: string | null;
  project_number: string | null;
  start_date: string | null;
  end_date: string | null;
  act_date: string | null;
  profile_length: number | null;
  plan_length: number | null;
  pipe_count: number | null;
  pipe_diameter_mm: number | null;
  drill_diameter: number | null;
  pipe_mark: string | null;
  pipe_quality_passport: string | null;
}

interface SignatoryRow {
  role: string;
  position_override: string | null;
  full_name: string;
  surname: string;
  position: string | null;
  position_long: string | null;
  org_short: string | null;
}

interface OrgRow {
  role: string;
  name: string;
  short_name: string;
}

interface MaterialRow {
  material_type: string;
  name: string;
  specifications: string | null;
  quantity: string | null;
  notes: string | null;
}

interface PersonRow {
  id: string;
  full_name: string;
  surname: string;
  position: string | null;
  position_long: string | null;
  org_name: string | null;
  org_short: string | null;
  aosr_full_line: string | null;
  is_active: number;
}

interface DocRow {
  doc_type: string;
  doc_number: string | null;
  doc_date: string | null;
  role_granted: string | null;
  is_current: number;
}
