/**
 * SQLite database client.
 *
 * Creates/opens .gnb-memory/gnb.db using better-sqlite3 + drizzle-orm.
 * WAL mode for concurrent reads. Foreign keys enforced.
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";
import path from "node:path";
import fs from "node:fs";

import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

let _db: BetterSQLite3Database<typeof schema> | null = null;
let _sqlite: Database.Database | null = null;

/**
 * Initialize (or return existing) database connection.
 * @param memoryDir - path to .gnb-memory directory
 */
export function getDb(memoryDir: string) {
  if (_db) return _db;

  const dbPath = path.join(memoryDir, "gnb.db");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  _sqlite = new Database(dbPath);
  _sqlite.pragma("journal_mode = WAL");
  _sqlite.pragma("foreign_keys = ON");

  _db = drizzle(_sqlite, { schema });

  // Run migrations (create tables if not exist)
  runMigrations(_sqlite);

  return _db;
}

/** Get raw better-sqlite3 instance (for migrations/raw queries). */
export function getRawDb(): Database.Database | null {
  return _sqlite;
}

/** Close database connection. */
export function closeDb(): void {
  if (_sqlite) {
    _sqlite.close();
    _sqlite = null;
    _db = null;
  }
}

/** Create tables if they don't exist. */
function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      short_name TEXT NOT NULL,
      inn TEXT,
      ogrn TEXT,
      legal_address TEXT,
      phone TEXT,
      sro_name TEXT,
      sro_number TEXT,
      sro_date TEXT,
      aosr_block TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS people (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      surname TEXT NOT NULL,
      position TEXT,
      position_long TEXT,
      org_id TEXT REFERENCES organizations(id),
      nrs_id TEXT,
      nrs_date TEXT,
      aosr_full_line TEXT,
      notes TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS person_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      person_id TEXT NOT NULL REFERENCES people(id),
      doc_type TEXT NOT NULL,
      doc_number TEXT,
      doc_date TEXT,
      valid_from TEXT,
      valid_until TEXT,
      role_granted TEXT,
      issuing_org TEXT,
      file_path TEXT,
      is_current INTEGER DEFAULT 1,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      official_name TEXT,
      org_id TEXT REFERENCES organizations(id),
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS customer_aliases (
      customer_id TEXT NOT NULL REFERENCES customers(id),
      alias TEXT NOT NULL,
      PRIMARY KEY (customer_id, alias)
    );

    CREATE TABLE IF NOT EXISTS objects (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL REFERENCES customers(id),
      short_name TEXT NOT NULL,
      official_name TEXT,
      title_line TEXT,
      default_address TEXT,
      default_project_number TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS transitions (
      id TEXT PRIMARY KEY,
      object_id TEXT NOT NULL REFERENCES objects(id),
      gnb_number TEXT NOT NULL,
      gnb_number_short TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      address TEXT,
      project_number TEXT,
      title_line TEXT,
      object_name TEXT,
      executor_id TEXT REFERENCES organizations(id),
      start_date TEXT,
      end_date TEXT,
      act_date TEXT,
      profile_length REAL,
      plan_length REAL,
      pipe_count INTEGER DEFAULT 2,
      drill_diameter REAL,
      configuration TEXT,
      pipe_mark TEXT,
      pipe_diameter_mm REAL,
      pipe_quality_passport TEXT,
      base_transition_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      finalized_at TEXT
    );

    CREATE TABLE IF NOT EXISTS transition_signatories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transition_id TEXT NOT NULL REFERENCES transitions(id),
      role TEXT NOT NULL,
      person_id TEXT NOT NULL REFERENCES people(id),
      person_doc_id INTEGER REFERENCES person_documents(id),
      org_id TEXT REFERENCES organizations(id),
      position_override TEXT,
      aosr_line_override TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS transition_orgs (
      transition_id TEXT NOT NULL REFERENCES transitions(id),
      role TEXT NOT NULL,
      org_id TEXT NOT NULL REFERENCES organizations(id),
      PRIMARY KEY (transition_id, role)
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      doc_type TEXT NOT NULL,
      original_filename TEXT,
      approved_name TEXT,
      doc_number TEXT,
      doc_date TEXT,
      valid_until TEXT,
      file_path TEXT,
      extracted_summary TEXT,
      confidence TEXT DEFAULT 'medium',
      status TEXT DEFAULT 'detected',
      origin TEXT,
      supersedes_document_id TEXT,
      reused_from_transition_id TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS document_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id TEXT NOT NULL REFERENCES documents(id),
      link_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      relation TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS materials (
      id TEXT PRIMARY KEY,
      material_type TEXT NOT NULL,
      name TEXT NOT NULL,
      manufacturer TEXT,
      specifications TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS transition_materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transition_id TEXT NOT NULL REFERENCES transitions(id),
      material_id TEXT NOT NULL REFERENCES materials(id),
      document_id TEXT REFERENCES documents(id),
      quantity TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS generated_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transition_id TEXT NOT NULL REFERENCES transitions(id),
      file_type TEXT NOT NULL,
      file_path TEXT NOT NULL,
      revision INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS person_role_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      person_id TEXT NOT NULL REFERENCES people(id),
      role TEXT NOT NULL,
      object_id TEXT REFERENCES objects(id),
      assigned_at TEXT NOT NULL,
      removed_at TEXT,
      person_doc_id INTEGER REFERENCES person_documents(id),
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS field_values (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      field_name TEXT NOT NULL,
      value TEXT,
      source_type TEXT NOT NULL,
      source_id TEXT,
      confidence TEXT DEFAULT 'high',
      confirmed_by_owner INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      superseded_at TEXT
    );

    CREATE TABLE IF NOT EXISTS conflict_resolutions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      field_name TEXT NOT NULL,
      chosen_value TEXT,
      rejected_value TEXT,
      chosen_source TEXT,
      rejected_source TEXT,
      resolution TEXT NOT NULL,
      resolved_by TEXT DEFAULT 'owner',
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Migrations: add columns that may not exist yet
  const addColumnIfMissing = (table: string, column: string, type: string) => {
    try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`); } catch { /* already exists */ }
  };
  addColumnIfMissing("organizations", "sro_date", "TEXT");

  // Create indexes (IF NOT EXISTS)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_people_surname ON people(surname);
    CREATE INDEX IF NOT EXISTS idx_people_org ON people(org_id);
    CREATE INDEX IF NOT EXISTS idx_person_docs_person ON person_documents(person_id);
    CREATE INDEX IF NOT EXISTS idx_role_assign_person ON person_role_assignments(person_id);
    CREATE INDEX IF NOT EXISTS idx_role_assign_object ON person_role_assignments(object_id);
    CREATE INDEX IF NOT EXISTS idx_customer_aliases_alias ON customer_aliases(alias);
    CREATE INDEX IF NOT EXISTS idx_transitions_object ON transitions(object_id);
    CREATE INDEX IF NOT EXISTS idx_transitions_status ON transitions(status);
    CREATE INDEX IF NOT EXISTS idx_trans_sig_transition ON transition_signatories(transition_id);
    CREATE INDEX IF NOT EXISTS idx_trans_sig_person ON transition_signatories(person_id);
    CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(doc_type);
    CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
    CREATE INDEX IF NOT EXISTS idx_documents_number ON documents(doc_number);
    CREATE INDEX IF NOT EXISTS idx_doc_links_document ON document_links(document_id);
    CREATE INDEX IF NOT EXISTS idx_doc_links_target ON document_links(link_type, target_id);
    CREATE INDEX IF NOT EXISTS idx_materials_type ON materials(material_type);
    CREATE INDEX IF NOT EXISTS idx_trans_materials_transition ON transition_materials(transition_id);
    CREATE INDEX IF NOT EXISTS idx_field_values_entity ON field_values(entity_type, entity_id, field_name);
    CREATE INDEX IF NOT EXISTS idx_conflict_res_entity ON conflict_resolutions(entity_type, entity_id);
  `);
}
