/**
 * SQLite schema for GNB knowledge base.
 *
 * 16 tables: organizations, people, person_documents, person_role_assignments,
 * customers, customer_aliases, objects, transitions, transition_signatories,
 * transition_orgs, documents, document_links, materials, transition_materials,
 * generated_files, field_values, conflict_resolutions.
 *
 * Drizzle ORM definitions — used for typed queries and migrations.
 */

import { sqliteTable, text, integer, real, primaryKey, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

const now = sql`(datetime('now'))`;

// === 1. organizations ===

export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  short_name: text("short_name").notNull(),
  inn: text("inn"),
  ogrn: text("ogrn"),
  legal_address: text("legal_address"),
  phone: text("phone"),
  sro_name: text("sro_name"),
  sro_number: text("sro_number"),
  sro_date: text("sro_date"),
  aosr_block: text("aosr_block"),
  created_at: text("created_at").notNull().default(now),
  updated_at: text("updated_at").notNull().default(now),
});

// === 2. people ===

export const people = sqliteTable("people", {
  id: text("id").primaryKey(),
  full_name: text("full_name").notNull(),
  surname: text("surname").notNull(),
  position: text("position"),
  position_long: text("position_long"),
  org_id: text("org_id").references(() => organizations.id),
  nrs_id: text("nrs_id"),
  nrs_date: text("nrs_date"),
  aosr_full_line: text("aosr_full_line"),
  notes: text("notes"),
  is_active: integer("is_active").default(1),
  created_at: text("created_at").notNull().default(now),
  updated_at: text("updated_at").notNull().default(now),
}, (t) => [
  index("idx_people_surname").on(t.surname),
  index("idx_people_org").on(t.org_id),
]);

// === 3. person_documents ===

export const personDocuments = sqliteTable("person_documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  person_id: text("person_id").notNull().references(() => people.id),
  doc_type: text("doc_type").notNull(),
  doc_number: text("doc_number"),
  doc_date: text("doc_date"),
  valid_from: text("valid_from"),
  valid_until: text("valid_until"),
  role_granted: text("role_granted"),
  issuing_org: text("issuing_org"),
  file_path: text("file_path"),
  is_current: integer("is_current").default(1),
  notes: text("notes"),
  created_at: text("created_at").notNull().default(now),
}, (t) => [
  index("idx_person_docs_person").on(t.person_id),
]);

// === 4. person_role_assignments ===

export const personRoleAssignments = sqliteTable("person_role_assignments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  person_id: text("person_id").notNull().references(() => people.id),
  role: text("role").notNull(),
  object_id: text("object_id").references(() => objects.id),
  assigned_at: text("assigned_at").notNull(),
  removed_at: text("removed_at"),
  person_doc_id: integer("person_doc_id").references(() => personDocuments.id),
  notes: text("notes"),
  created_at: text("created_at").notNull().default(now),
}, (t) => [
  index("idx_role_assign_person").on(t.person_id),
  index("idx_role_assign_object").on(t.object_id),
]);

// === 5. customers ===

export const customers = sqliteTable("customers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  official_name: text("official_name"),
  org_id: text("org_id").references(() => organizations.id),
  notes: text("notes"),
  created_at: text("created_at").notNull().default(now),
});

export const customerAliases = sqliteTable("customer_aliases", {
  customer_id: text("customer_id").notNull().references(() => customers.id),
  alias: text("alias").notNull(),
}, (t) => [
  primaryKey({ columns: [t.customer_id, t.alias] }),
  index("idx_customer_aliases_alias").on(t.alias),
]);

// === 6. objects ===

export const objects = sqliteTable("objects", {
  id: text("id").primaryKey(),
  customer_id: text("customer_id").notNull().references(() => customers.id),
  short_name: text("short_name").notNull(),
  official_name: text("official_name"),
  title_line: text("title_line"),
  default_address: text("default_address"),
  default_project_number: text("default_project_number"),
  notes: text("notes"),
  created_at: text("created_at").notNull().default(now),
  updated_at: text("updated_at").notNull().default(now),
});

// === 7. transitions ===

export const transitions = sqliteTable("transitions", {
  id: text("id").primaryKey(),
  object_id: text("object_id").notNull().references(() => objects.id),
  gnb_number: text("gnb_number").notNull(),
  gnb_number_short: text("gnb_number_short"),
  status: text("status").notNull().default("draft"),
  address: text("address"),
  project_number: text("project_number"),
  title_line: text("title_line"),
  object_name: text("object_name"),
  executor_id: text("executor_id").references(() => organizations.id),
  start_date: text("start_date"),
  end_date: text("end_date"),
  act_date: text("act_date"),
  profile_length: real("profile_length"),
  plan_length: real("plan_length"),
  pipe_count: integer("pipe_count").default(2),
  drill_diameter: real("drill_diameter"),
  configuration: text("configuration"),
  pipe_mark: text("pipe_mark"),
  pipe_diameter_mm: real("pipe_diameter_mm"),
  pipe_quality_passport: text("pipe_quality_passport"),
  base_transition_id: text("base_transition_id"),
  created_at: text("created_at").notNull().default(now),
  updated_at: text("updated_at").notNull().default(now),
  finalized_at: text("finalized_at"),
}, (t) => [
  index("idx_transitions_object").on(t.object_id),
  index("idx_transitions_status").on(t.status),
]);

// === 8. transition_signatories ===

export const transitionSignatories = sqliteTable("transition_signatories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  transition_id: text("transition_id").notNull().references(() => transitions.id),
  role: text("role").notNull(),
  person_id: text("person_id").notNull().references(() => people.id),
  person_doc_id: integer("person_doc_id").references(() => personDocuments.id),
  org_id: text("org_id").references(() => organizations.id),
  position_override: text("position_override"),
  aosr_line_override: text("aosr_line_override"),
  created_at: text("created_at").notNull().default(now),
}, (t) => [
  index("idx_trans_sig_transition").on(t.transition_id),
  index("idx_trans_sig_person").on(t.person_id),
]);

// === 9. transition_orgs ===

export const transitionOrgs = sqliteTable("transition_orgs", {
  transition_id: text("transition_id").notNull().references(() => transitions.id),
  role: text("role").notNull(),
  org_id: text("org_id").notNull().references(() => organizations.id),
}, (t) => [
  primaryKey({ columns: [t.transition_id, t.role] }),
]);

// === 10. documents ===

export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(),
  doc_type: text("doc_type").notNull(),
  original_filename: text("original_filename"),
  approved_name: text("approved_name"),
  doc_number: text("doc_number"),
  doc_date: text("doc_date"),
  valid_until: text("valid_until"),
  file_path: text("file_path"),
  extracted_summary: text("extracted_summary"),
  confidence: text("confidence").default("medium"),
  status: text("status").default("detected"),
  origin: text("origin"),
  supersedes_document_id: text("supersedes_document_id"),
  reused_from_transition_id: text("reused_from_transition_id"),
  notes: text("notes"),
  gdrive_file_id: text("gdrive_file_id"),
  gdrive_synced_at: text("gdrive_synced_at"),
  created_at: text("created_at").notNull().default(now),
  updated_at: text("updated_at").notNull().default(now),
}, (t) => [
  index("idx_documents_type").on(t.doc_type),
  index("idx_documents_status").on(t.status),
  index("idx_documents_number").on(t.doc_number),
]);

// === 11. document_links ===

export const documentLinks = sqliteTable("document_links", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  document_id: text("document_id").notNull().references(() => documents.id),
  link_type: text("link_type").notNull(),
  target_id: text("target_id").notNull(),
  relation: text("relation"),
  notes: text("notes"),
  created_at: text("created_at").notNull().default(now),
}, (t) => [
  index("idx_doc_links_document").on(t.document_id),
  index("idx_doc_links_target").on(t.link_type, t.target_id),
]);

// === 12. materials ===

export const materials = sqliteTable("materials", {
  id: text("id").primaryKey(),
  material_type: text("material_type").notNull(),
  name: text("name").notNull(),
  manufacturer: text("manufacturer"),
  specifications: text("specifications"),
  notes: text("notes"),
  created_at: text("created_at").notNull().default(now),
  updated_at: text("updated_at").notNull().default(now),
}, (t) => [
  index("idx_materials_type").on(t.material_type),
]);

// === 13. transition_materials ===

export const transitionMaterials = sqliteTable("transition_materials", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  transition_id: text("transition_id").notNull().references(() => transitions.id),
  material_id: text("material_id").notNull().references(() => materials.id),
  document_id: text("document_id").references(() => documents.id),
  quantity: text("quantity"),
  notes: text("notes"),
  created_at: text("created_at").notNull().default(now),
}, (t) => [
  index("idx_trans_materials_transition").on(t.transition_id),
]);

// === 14. generated_files ===

export const generatedFiles = sqliteTable("generated_files", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  transition_id: text("transition_id").notNull().references(() => transitions.id),
  file_type: text("file_type").notNull(),
  file_path: text("file_path").notNull(),
  revision: integer("revision").default(0),
  created_at: text("created_at").notNull().default(now),
});

// === 15. field_values ===

export const fieldValues = sqliteTable("field_values", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  entity_type: text("entity_type").notNull(),
  entity_id: text("entity_id").notNull(),
  field_name: text("field_name").notNull(),
  value: text("value"),
  source_type: text("source_type").notNull(),
  source_id: text("source_id"),
  confidence: text("confidence").default("high"),
  confirmed_by_owner: integer("confirmed_by_owner").default(0),
  created_at: text("created_at").notNull().default(now),
  superseded_at: text("superseded_at"),
}, (t) => [
  index("idx_field_values_entity").on(t.entity_type, t.entity_id, t.field_name),
]);

// === 16. conflict_resolutions ===

export const conflictResolutions = sqliteTable("conflict_resolutions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  entity_type: text("entity_type").notNull(),
  entity_id: text("entity_id").notNull(),
  field_name: text("field_name").notNull(),
  chosen_value: text("chosen_value"),
  rejected_value: text("rejected_value"),
  chosen_source: text("chosen_source"),
  rejected_source: text("rejected_source"),
  resolution: text("resolution").notNull(),
  resolved_by: text("resolved_by").default("owner"),
  notes: text("notes"),
  created_at: text("created_at").notNull().default(now),
}, (t) => [
  index("idx_conflict_res_entity").on(t.entity_type, t.entity_id),
]);
