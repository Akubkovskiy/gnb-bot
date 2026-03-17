/**
 * Retrieval API — typed knowledge queries over SQLite.
 *
 * This is CODE, not a skill. Deterministic, testable, no LLM.
 * Skills receive retrieval results as structured context.
 */

import { eq, like, and, isNull, desc, or } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as s from "./schema.js";

type Db = BetterSQLite3Database<typeof s>;

// === Result types ===

export interface PersonProfile {
  person: typeof s.people.$inferSelect;
  isActive: boolean;
  org?: typeof s.organizations.$inferSelect;
  currentDocs: Array<typeof s.personDocuments.$inferSelect>;
  activeRoles: string[];
  roleHistory: Array<{
    role: string;
    objectName?: string;
    objectId?: string;
    assignedAt: string;
    removedAt?: string | null;
  }>;
  transitionHistory: Array<{
    transitionId: string;
    gnbNumber: string;
    objectName?: string;
    role: string;
  }>;
}

export interface ObjectProfile {
  object: typeof s.objects.$inferSelect;
  customer?: typeof s.customers.$inferSelect;
  transitions: Array<typeof s.transitions.$inferSelect>;
  lastFinalized?: typeof s.transitions.$inferSelect;
  /** Signatories from last finalized transition. */
  lastSignatories: Array<{
    role: string;
    personId: string;
    fullName: string;
    position?: string | null;
    orgName?: string | null;
  }>;
}

export interface ReusableDoc {
  document: typeof s.documents.$inferSelect;
  materialName?: string;
  relation?: string | null;
}

export interface DraftKnowledgeContext {
  object?: ObjectProfile;
  mentionedPeople: PersonProfile[];
  reusablePipeDocs: ReusableDoc[];
  reusableMaterialDocs: ReusableDoc[];
  lastTransition?: typeof s.transitions.$inferSelect;
}

// === Query functions ===

/**
 * Find a person by surname or partial name match.
 * Returns full profile with org, docs, role history, transition history.
 */
export function findPersonByName(db: Db, query: string): PersonProfile[] {
  const pattern = `%${query}%`;
  const rows = db.select().from(s.people)
    .where(or(like(s.people.surname, pattern), like(s.people.full_name, pattern)))
    .all();

  return rows
    .map((person) => buildPersonProfile(db, person))
    .sort((a, b) => scorePersonProfile(b) - scorePersonProfile(a));
}

/**
 * Get person profile by exact ID.
 */
export function findPersonById(db: Db, personId: string): PersonProfile | null {
  const person = db.select().from(s.people).where(eq(s.people.id, personId)).get();
  if (!person) return null;
  return buildPersonProfile(db, person);
}

/**
 * Find all documents linked to a person.
 */
export function findDocsByPerson(db: Db, personId: string): Array<typeof s.documents.$inferSelect> {
  const links = db.select().from(s.documentLinks)
    .where(and(eq(s.documentLinks.link_type, "person"), eq(s.documentLinks.target_id, personId)))
    .all();

  return links.map((l) =>
    db.select().from(s.documents).where(eq(s.documents.id, l.document_id)).get(),
  ).filter(Boolean) as Array<typeof s.documents.$inferSelect>;
}

/**
 * Get object profile with transitions and last signatories.
 */
export function getObjectProfile(db: Db, objectId: string): ObjectProfile | null {
  const obj = db.select().from(s.objects).where(eq(s.objects.id, objectId)).get();
  if (!obj) return null;

  const customer = obj.customer_id
    ? db.select().from(s.customers).where(eq(s.customers.id, obj.customer_id)).get()
    : undefined;

  const transitions = db.select().from(s.transitions)
    .where(eq(s.transitions.object_id, objectId))
    .orderBy(desc(s.transitions.created_at))
    .all();

  const lastFinalized = transitions.find((t) => t.status === "finalized");

  let lastSignatories: ObjectProfile["lastSignatories"] = [];
  if (lastFinalized) {
    const sigs = db.select().from(s.transitionSignatories)
      .where(eq(s.transitionSignatories.transition_id, lastFinalized.id))
      .all();

    lastSignatories = sigs.map((sig) => {
      const person = db.select().from(s.people).where(eq(s.people.id, sig.person_id)).get();
      const org = sig.org_id
        ? db.select().from(s.organizations).where(eq(s.organizations.id, sig.org_id)).get()
        : undefined;
      return {
        role: sig.role,
        personId: sig.person_id,
        fullName: person?.full_name ?? sig.person_id,
        position: person?.position,
        orgName: org?.short_name,
      };
    });
  }

  return { object: obj, customer, transitions, lastFinalized, lastSignatories };
}

/**
 * Find all transitions for an object.
 */
export function findTransitionsByObject(db: Db, objectId: string) {
  return db.select().from(s.transitions)
    .where(eq(s.transitions.object_id, objectId))
    .orderBy(desc(s.transitions.created_at))
    .all();
}

/**
 * Find reusable pipe documents for an object.
 */
export function findReusablePipeDocs(db: Db, objectId: string): ReusableDoc[] {
  const transitionIds = db.select({ id: s.transitions.id }).from(s.transitions)
    .where(eq(s.transitions.object_id, objectId))
    .all()
    .map((t) => t.id);

  if (transitionIds.length === 0) return [];

  const results: ReusableDoc[] = [];
  for (const tid of transitionIds) {
    const tmRows = db.select().from(s.transitionMaterials)
      .where(eq(s.transitionMaterials.transition_id, tid))
      .all();

    for (const tm of tmRows) {
      const mat = db.select().from(s.materials).where(eq(s.materials.id, tm.material_id)).get();
      if (!mat || mat.material_type !== "pipe") continue;

      if (tm.document_id) {
        const doc = db.select().from(s.documents).where(eq(s.documents.id, tm.document_id)).get();
        if (doc && doc.status !== "rejected") {
          results.push({ document: doc, materialName: mat.name, relation: "passport" });
        }
      }
    }
  }

  // Also check document_links for pipe-related docs
  const pipeLinks = db.select().from(s.documentLinks)
    .where(eq(s.documentLinks.link_type, "material"))
    .all();

  for (const link of pipeLinks) {
    const mat = db.select().from(s.materials).where(eq(s.materials.id, link.target_id)).get();
    if (!mat || mat.material_type !== "pipe") continue;
    const doc = db.select().from(s.documents).where(eq(s.documents.id, link.document_id)).get();
    if (doc && doc.status !== "rejected" && !results.some((r) => r.document.id === doc.id)) {
      results.push({ document: doc, materialName: mat.name, relation: link.relation });
    }
  }

  return results;
}

/**
 * Find reusable material documents (bentonite, UKPT, plugs, cord).
 */
export function findReusableMaterialDocs(db: Db, materialType: string): ReusableDoc[] {
  const mats = db.select().from(s.materials).where(eq(s.materials.material_type, materialType)).all();
  const results: ReusableDoc[] = [];

  for (const mat of mats) {
    const links = db.select().from(s.documentLinks)
      .where(and(eq(s.documentLinks.link_type, "material"), eq(s.documentLinks.target_id, mat.id)))
      .all();

    for (const link of links) {
      const doc = db.select().from(s.documents).where(eq(s.documents.id, link.document_id)).get();
      if (doc && doc.status !== "rejected") {
        results.push({ document: doc, materialName: mat.name, relation: link.relation });
      }
    }
  }

  return results;
}

/**
 * Find latest signatory-related documents (orders, appointments).
 */
export function findLatestSignatoryDocs(db: Db, personId: string) {
  return db.select().from(s.personDocuments)
    .where(and(eq(s.personDocuments.person_id, personId), eq(s.personDocuments.is_current, 1)))
    .all();
}

/**
 * Build full knowledge context for a new draft.
 * This is what gets passed to Claude skills as retrieval context.
 */
export function getBaseKnowledgeForDraft(
  db: Db,
  objectId: string,
  mentionedNames: string[] = [],
): DraftKnowledgeContext {
  const object = getObjectProfile(db, objectId) ?? undefined;
  const lastTransition = object?.lastFinalized;

  const mentionedPeople: PersonProfile[] = [];
  for (const name of mentionedNames) {
    const found = findPersonByName(db, name);
    mentionedPeople.push(...found);
  }

  const reusablePipeDocs = findReusablePipeDocs(db, objectId);
  const reusableMaterialDocs = [
    ...findReusableMaterialDocs(db, "bentonite"),
    ...findReusableMaterialDocs(db, "ukpt"),
    ...findReusableMaterialDocs(db, "plugs"),
    ...findReusableMaterialDocs(db, "cord"),
  ];

  return {
    object,
    mentionedPeople,
    reusablePipeDocs,
    reusableMaterialDocs,
    lastTransition,
  };
}

// === Alias-friendly lookups ===

/**
 * Find customer by name, alias, or partial match.
 * Supports: "Крафт", "крафт", "kraft", "ОЭК".
 */
export function findCustomer(db: Db, query: string): typeof s.customers.$inferSelect | null {
  const lower = query.toLowerCase().trim();

  // Try exact alias match first
  const aliasRow = db.select().from(s.customerAliases)
    .where(eq(s.customerAliases.alias, lower))
    .get();
  if (aliasRow) {
    return db.select().from(s.customers).where(eq(s.customers.id, aliasRow.customer_id)).get() ?? null;
  }

  // Try name match
  const byName = db.select().from(s.customers)
    .where(like(s.customers.name, `%${query}%`))
    .get();
  if (byName) return byName;

  // Try official name
  return db.select().from(s.customers)
    .where(like(s.customers.official_name, `%${query}%`))
    .get() ?? null;
}

/**
 * Find object by short name, official name, or partial match within a customer.
 */
export function findObject(db: Db, customerId: string, query: string): typeof s.objects.$inferSelect | null {
  const objects = db.select().from(s.objects)
    .where(eq(s.objects.customer_id, customerId))
    .all();

  const lower = query.toLowerCase().trim();

  // Exact short name
  const exact = objects.find((o) => o.short_name.toLowerCase() === lower);
  if (exact) return exact;

  // Partial short name
  const partial = objects.find((o) => o.short_name.toLowerCase().includes(lower));
  if (partial) return partial;

  // Official name
  const official = objects.find((o) => o.official_name?.toLowerCase().includes(lower));
  if (official) return official;

  return null;
}

/**
 * Find object across all customers by any name.
 */
export function findObjectGlobal(db: Db, query: string): typeof s.objects.$inferSelect | null {
  const lower = query.toLowerCase().trim();
  return db.select().from(s.objects)
    .where(or(
      like(s.objects.short_name, `%${query}%`),
      like(s.objects.official_name, `%${query}%`),
    ))
    .get() ?? null;
}

// === Internal helpers ===

function buildPersonProfile(db: Db, person: typeof s.people.$inferSelect): PersonProfile {
  const org = person.org_id
    ? db.select().from(s.organizations).where(eq(s.organizations.id, person.org_id)).get()
    : undefined;

  const currentDocs = db.select().from(s.personDocuments)
    .where(and(eq(s.personDocuments.person_id, person.id), eq(s.personDocuments.is_current, 1)))
    .all();

  const roleAssignments = db.select().from(s.personRoleAssignments)
    .where(eq(s.personRoleAssignments.person_id, person.id))
    .all();

  const activeRoles = roleAssignments
    .filter((ra) => !ra.removed_at)
    .map((ra) => ra.role);

  const roleHistory = roleAssignments.map((ra) => {
    const obj = ra.object_id
      ? db.select().from(s.objects).where(eq(s.objects.id, ra.object_id)).get()
      : undefined;
    return {
      role: ra.role,
      objectName: obj?.short_name,
      objectId: ra.object_id ?? undefined,
      assignedAt: ra.assigned_at,
      removedAt: ra.removed_at,
    };
  });

  // Transition history
  const transSigs = db.select().from(s.transitionSignatories)
    .where(eq(s.transitionSignatories.person_id, person.id))
    .all();

  const transitionHistory = transSigs.map((ts) => {
    const t = db.select().from(s.transitions).where(eq(s.transitions.id, ts.transition_id)).get();
    const obj = t?.object_id
      ? db.select().from(s.objects).where(eq(s.objects.id, t.object_id)).get()
      : undefined;
    return {
      transitionId: ts.transition_id,
      gnbNumber: t?.gnb_number ?? "",
      objectName: obj?.short_name,
      role: ts.role,
    };
  });

  return {
    person,
    isActive: person.is_active === 1,
    org,
    currentDocs,
    activeRoles,
    roleHistory,
    transitionHistory,
  };
}

function scorePersonProfile(profile: PersonProfile): number {
  let score = 0;

  if (profile.isActive) score += 100;
  score += profile.activeRoles.length * 10;
  score += profile.currentDocs.length * 5;
  score += profile.transitionHistory.length;

  return score;
}
