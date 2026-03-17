/**
 * SQLite repositories — typed CRUD for all knowledge entities.
 *
 * These are CODE, not skills. Deterministic, testable, no LLM.
 */

import { eq, like, and, isNull, desc } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as s from "./schema.js";

type Db = BetterSQLite3Database<typeof s>;

// === Organizations ===

export class OrgRepo {
  constructor(private db: Db) {}

  getAll() { return this.db.select().from(s.organizations).all(); }
  getById(id: string) { return this.db.select().from(s.organizations).where(eq(s.organizations.id, id)).get(); }

  upsert(org: typeof s.organizations.$inferInsert) {
    return this.db.insert(s.organizations).values(org)
      .onConflictDoUpdate({ target: s.organizations.id, set: { ...org, updated_at: new Date().toISOString() } })
      .run();
  }
}

// === People ===

export class PeopleRepo {
  constructor(private db: Db) {}

  getAll() { return this.db.select().from(s.people).where(eq(s.people.is_active, 1)).all(); }
  getById(id: string) { return this.db.select().from(s.people).where(eq(s.people.id, id)).get(); }

  findBySurname(surname: string) {
    return this.db.select().from(s.people)
      .where(like(s.people.surname, `%${surname}%`))
      .all();
  }

  findByName(query: string) {
    return this.db.select().from(s.people)
      .where(like(s.people.full_name, `%${query}%`))
      .all();
  }

  upsert(person: typeof s.people.$inferInsert) {
    return this.db.insert(s.people).values(person)
      .onConflictDoUpdate({ target: s.people.id, set: { ...person, updated_at: new Date().toISOString() } })
      .run();
  }
}

// === Person Documents ===

export class PersonDocRepo {
  constructor(private db: Db) {}

  getByPersonId(personId: string) {
    return this.db.select().from(s.personDocuments)
      .where(eq(s.personDocuments.person_id, personId))
      .all();
  }

  getCurrentByPersonId(personId: string) {
    return this.db.select().from(s.personDocuments)
      .where(and(eq(s.personDocuments.person_id, personId), eq(s.personDocuments.is_current, 1)))
      .all();
  }

  insert(doc: typeof s.personDocuments.$inferInsert) {
    return this.db.insert(s.personDocuments).values(doc).run();
  }
}

// === Customers ===

export class CustomerRepo {
  constructor(private db: Db) {}

  getAll() { return this.db.select().from(s.customers).all(); }
  getById(id: string) { return this.db.select().from(s.customers).where(eq(s.customers.id, id)).get(); }

  findByAlias(alias: string) {
    const lower = alias.toLowerCase();
    const aliasRow = this.db.select().from(s.customerAliases)
      .where(eq(s.customerAliases.alias, lower))
      .get();
    if (!aliasRow) return null;
    return this.getById(aliasRow.customer_id);
  }

  upsert(customer: typeof s.customers.$inferInsert, aliases: string[] = []) {
    this.db.insert(s.customers).values(customer)
      .onConflictDoUpdate({ target: s.customers.id, set: customer })
      .run();
    for (const alias of aliases) {
      this.db.insert(s.customerAliases).values({ customer_id: customer.id!, alias: alias.toLowerCase() })
        .onConflictDoNothing()
        .run();
    }
  }
}

// === Objects ===

export class ObjectRepo {
  constructor(private db: Db) {}

  getByCustomerId(customerId: string) {
    return this.db.select().from(s.objects)
      .where(eq(s.objects.customer_id, customerId))
      .all();
  }

  getById(id: string) { return this.db.select().from(s.objects).where(eq(s.objects.id, id)).get(); }

  upsert(obj: typeof s.objects.$inferInsert) {
    return this.db.insert(s.objects).values(obj)
      .onConflictDoUpdate({ target: s.objects.id, set: { ...obj, updated_at: new Date().toISOString() } })
      .run();
  }
}

// === Transitions ===

export class TransitionRepo {
  constructor(private db: Db) {}

  getById(id: string) { return this.db.select().from(s.transitions).where(eq(s.transitions.id, id)).get(); }

  getByObjectId(objectId: string) {
    return this.db.select().from(s.transitions)
      .where(eq(s.transitions.object_id, objectId))
      .orderBy(desc(s.transitions.created_at))
      .all();
  }

  getLastFinalized(objectId: string) {
    return this.db.select().from(s.transitions)
      .where(and(eq(s.transitions.object_id, objectId), eq(s.transitions.status, "finalized")))
      .orderBy(desc(s.transitions.created_at))
      .limit(1)
      .get();
  }

  insert(t: typeof s.transitions.$inferInsert) {
    return this.db.insert(s.transitions).values(t).run();
  }

  updateStatus(id: string, status: string) {
    return this.db.update(s.transitions)
      .set({ status, updated_at: new Date().toISOString(), finalized_at: status === "finalized" ? new Date().toISOString() : undefined })
      .where(eq(s.transitions.id, id))
      .run();
  }
}

// === Transition Signatories ===

export class TransitionSignatoryRepo {
  constructor(private db: Db) {}

  getByTransitionId(transitionId: string) {
    return this.db.select().from(s.transitionSignatories)
      .where(eq(s.transitionSignatories.transition_id, transitionId))
      .all();
  }

  insert(sig: typeof s.transitionSignatories.$inferInsert) {
    return this.db.insert(s.transitionSignatories).values(sig).run();
  }
}

// === Transition Orgs ===

export class TransitionOrgRepo {
  constructor(private db: Db) {}

  getByTransitionId(transitionId: string) {
    return this.db.select().from(s.transitionOrgs)
      .where(eq(s.transitionOrgs.transition_id, transitionId))
      .all();
  }

  upsert(to: typeof s.transitionOrgs.$inferInsert) {
    return this.db.insert(s.transitionOrgs).values(to)
      .onConflictDoUpdate({ target: [s.transitionOrgs.transition_id, s.transitionOrgs.role], set: { org_id: to.org_id } })
      .run();
  }
}

// === Documents ===

export class DocumentRepo {
  constructor(private db: Db) {}

  getById(id: string) { return this.db.select().from(s.documents).where(eq(s.documents.id, id)).get(); }

  getByType(docType: string) {
    return this.db.select().from(s.documents)
      .where(eq(s.documents.doc_type, docType))
      .all();
  }

  insert(doc: typeof s.documents.$inferInsert) {
    return this.db.insert(s.documents).values(doc).run();
  }

  updateStatus(id: string, status: string) {
    return this.db.update(s.documents)
      .set({ status, updated_at: new Date().toISOString() })
      .where(eq(s.documents.id, id))
      .run();
  }
}

// === Document Links ===

export class DocumentLinkRepo {
  constructor(private db: Db) {}

  getByDocumentId(documentId: string) {
    return this.db.select().from(s.documentLinks)
      .where(eq(s.documentLinks.document_id, documentId))
      .all();
  }

  getByTarget(linkType: string, targetId: string) {
    return this.db.select().from(s.documentLinks)
      .where(and(eq(s.documentLinks.link_type, linkType), eq(s.documentLinks.target_id, targetId)))
      .all();
  }

  insert(link: typeof s.documentLinks.$inferInsert) {
    return this.db.insert(s.documentLinks).values(link).run();
  }
}

// === Materials ===

export class MaterialRepo {
  constructor(private db: Db) {}

  getAll() { return this.db.select().from(s.materials).all(); }
  getByType(type: string) { return this.db.select().from(s.materials).where(eq(s.materials.material_type, type)).all(); }

  upsert(mat: typeof s.materials.$inferInsert) {
    return this.db.insert(s.materials).values(mat)
      .onConflictDoUpdate({ target: s.materials.id, set: { ...mat, updated_at: new Date().toISOString() } })
      .run();
  }
}

// === Field Values (Provenance) ===

export class FieldValueRepo {
  constructor(private db: Db) {}

  getCurrent(entityType: string, entityId: string, fieldName: string) {
    return this.db.select().from(s.fieldValues)
      .where(and(
        eq(s.fieldValues.entity_type, entityType),
        eq(s.fieldValues.entity_id, entityId),
        eq(s.fieldValues.field_name, fieldName),
        isNull(s.fieldValues.superseded_at),
      ))
      .get();
  }

  getAllCurrent(entityType: string, entityId: string) {
    return this.db.select().from(s.fieldValues)
      .where(and(
        eq(s.fieldValues.entity_type, entityType),
        eq(s.fieldValues.entity_id, entityId),
        isNull(s.fieldValues.superseded_at),
      ))
      .all();
  }

  insert(fv: typeof s.fieldValues.$inferInsert) {
    // Supersede existing current value first
    this.db.update(s.fieldValues)
      .set({ superseded_at: new Date().toISOString() })
      .where(and(
        eq(s.fieldValues.entity_type, fv.entity_type),
        eq(s.fieldValues.entity_id, fv.entity_id),
        eq(s.fieldValues.field_name, fv.field_name),
        isNull(s.fieldValues.superseded_at),
      ))
      .run();

    return this.db.insert(s.fieldValues).values(fv).run();
  }
}

// === Conflict Resolutions ===

export class ConflictResolutionRepo {
  constructor(private db: Db) {}

  getByEntity(entityType: string, entityId: string) {
    return this.db.select().from(s.conflictResolutions)
      .where(and(eq(s.conflictResolutions.entity_type, entityType), eq(s.conflictResolutions.entity_id, entityId)))
      .all();
  }

  insert(cr: typeof s.conflictResolutions.$inferInsert) {
    return this.db.insert(s.conflictResolutions).values(cr).run();
  }
}

// === Convenience: All repos from a single db instance ===

export function createRepos(db: Db) {
  return {
    orgs: new OrgRepo(db),
    people: new PeopleRepo(db),
    personDocs: new PersonDocRepo(db),
    customers: new CustomerRepo(db),
    objects: new ObjectRepo(db),
    transitions: new TransitionRepo(db),
    transitionSigs: new TransitionSignatoryRepo(db),
    transitionOrgs: new TransitionOrgRepo(db),
    documents: new DocumentRepo(db),
    documentLinks: new DocumentLinkRepo(db),
    materials: new MaterialRepo(db),
    fieldValues: new FieldValueRepo(db),
    conflictResolutions: new ConflictResolutionRepo(db),
  };
}
