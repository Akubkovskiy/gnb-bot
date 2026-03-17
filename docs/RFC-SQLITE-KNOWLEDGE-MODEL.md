# RFC: SQLite Knowledge Model for GNB Bot

**Status:** Phase 1 finalized
**Date:** 2026-03-17

## Принцип

- **SQLite = память** (долгосрочное хранилище всех сущностей и связей)
- **Retrieval = код** (typed SQL queries, ranking — без LLM)
- **Claude skills = reasoning** (понимание текста, решения, summaries)
- **Bot code = исполнитель** (draft, validation, generation, Telegram)

Skills НЕ делают SQL. Код делает retrieval → собирает context → skill reasoning → код применяет результат.

---

## Схема базы данных (16 таблиц)

### 1. organizations

```sql
CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  inn TEXT,
  ogrn TEXT,
  legal_address TEXT,
  phone TEXT,
  sro_name TEXT,
  sro_number TEXT,
  aosr_block TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 2. people

```sql
CREATE TABLE people (
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
```

### 3. person_documents

```sql
CREATE TABLE person_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id TEXT NOT NULL REFERENCES people(id),
  doc_type TEXT NOT NULL,        -- 'приказ', 'распоряжение', 'назначение'
  doc_number TEXT,
  doc_date TEXT,
  valid_from TEXT,
  valid_until TEXT,
  role_granted TEXT,             -- 'sign2', 'tech', 'sign1'
  issuing_org TEXT,
  file_path TEXT,
  is_current INTEGER DEFAULT 1,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 4. person_role_assignments — История ролей человека

```sql
CREATE TABLE person_role_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id TEXT NOT NULL REFERENCES people(id),
  role TEXT NOT NULL,            -- 'sign1', 'sign2', 'sign3', 'tech'
  object_id TEXT REFERENCES objects(id),
  assigned_at TEXT NOT NULL,     -- когда назначен на эту роль/объект
  removed_at TEXT,               -- когда снят (NULL = текущий)
  person_doc_id INTEGER REFERENCES person_documents(id),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 5. customers

```sql
CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  official_name TEXT,
  org_id TEXT REFERENCES organizations(id),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE customer_aliases (
  customer_id TEXT NOT NULL REFERENCES customers(id),
  alias TEXT NOT NULL,
  PRIMARY KEY (customer_id, alias)
);
```

### 6. objects

```sql
CREATE TABLE objects (
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
```

### 7. transitions

```sql
CREATE TABLE transitions (
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
  base_transition_id TEXT REFERENCES transitions(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  finalized_at TEXT
);
```

### 8. transition_signatories

```sql
CREATE TABLE transition_signatories (
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
```

### 9. transition_orgs

```sql
CREATE TABLE transition_orgs (
  transition_id TEXT NOT NULL REFERENCES transitions(id),
  role TEXT NOT NULL,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  PRIMARY KEY (transition_id, role)
);
```

### 10. documents

```sql
CREATE TABLE documents (
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
  -- Lineage
  origin TEXT,                        -- 'extraction', 'manual', 'inherited', 'generated'
  supersedes_document_id TEXT REFERENCES documents(id),
  reused_from_transition_id TEXT REFERENCES transitions(id),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 11. document_links

```sql
CREATE TABLE document_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id TEXT NOT NULL REFERENCES documents(id),
  link_type TEXT NOT NULL,       -- 'transition', 'person', 'material', 'object', 'organization'
  target_id TEXT NOT NULL,
  relation TEXT,                 -- 'source_scheme', 'passport', 'certificate', 'order', 'generated'
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 12. materials

```sql
CREATE TABLE materials (
  id TEXT PRIMARY KEY,
  material_type TEXT NOT NULL,   -- 'pipe', 'bentonite', 'ukpt', 'plugs', 'cord'
  name TEXT NOT NULL,
  manufacturer TEXT,
  specifications TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 13. transition_materials

```sql
CREATE TABLE transition_materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transition_id TEXT NOT NULL REFERENCES transitions(id),
  material_id TEXT NOT NULL REFERENCES materials(id),
  document_id TEXT REFERENCES documents(id),
  quantity TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 14. generated_files

```sql
CREATE TABLE generated_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transition_id TEXT NOT NULL REFERENCES transitions(id),
  file_type TEXT NOT NULL,
  file_path TEXT NOT NULL,
  revision INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 15. field_values — Provenance per field

```sql
CREATE TABLE field_values (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,     -- 'transition', 'draft'
  entity_id TEXT NOT NULL,       -- transition_id or draft_id
  field_name TEXT NOT NULL,
  value TEXT,                    -- JSON-encoded value
  source_type TEXT NOT NULL,     -- 'manual', 'pdf', 'excel', 'prior_act', 'inferred'
  source_id TEXT,                -- document_id or 'owner-input'
  confidence TEXT DEFAULT 'high',
  confirmed_by_owner INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  superseded_at TEXT             -- NULL = current active value
);
CREATE INDEX idx_field_values_entity ON field_values(entity_type, entity_id, field_name);
CREATE INDEX idx_field_values_active ON field_values(entity_type, entity_id, field_name, superseded_at)
  WHERE superseded_at IS NULL;
```

### 16. conflict_resolutions — Owner decision history

```sql
CREATE TABLE conflict_resolutions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,     -- 'transition', 'draft'
  entity_id TEXT NOT NULL,
  field_name TEXT NOT NULL,
  chosen_value TEXT,             -- JSON
  rejected_value TEXT,           -- JSON
  chosen_source TEXT,
  rejected_source TEXT,
  resolution TEXT NOT NULL,      -- 'accept_new', 'keep_old', 'manual_override', 'use_from_db'
  resolved_by TEXT DEFAULT 'owner',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_conflict_res_entity ON conflict_resolutions(entity_type, entity_id);
```

---

## Retrieval-oriented indexes

```sql
-- People search
CREATE INDEX idx_people_surname ON people(surname);
CREATE INDEX idx_people_org ON people(org_id);
CREATE INDEX idx_people_active ON people(is_active) WHERE is_active = 1;

-- Person documents
CREATE INDEX idx_person_docs_person ON person_documents(person_id);
CREATE INDEX idx_person_docs_current ON person_documents(person_id, is_current) WHERE is_current = 1;

-- Role assignments
CREATE INDEX idx_role_assign_person ON person_role_assignments(person_id);
CREATE INDEX idx_role_assign_object ON person_role_assignments(object_id);
CREATE INDEX idx_role_assign_active ON person_role_assignments(person_id, removed_at) WHERE removed_at IS NULL;

-- Transitions
CREATE INDEX idx_transitions_object ON transitions(object_id);
CREATE INDEX idx_transitions_status ON transitions(status);
CREATE INDEX idx_transitions_gnb ON transitions(gnb_number);

-- Signatories
CREATE INDEX idx_trans_sig_transition ON transition_signatories(transition_id);
CREATE INDEX idx_trans_sig_person ON transition_signatories(person_id);

-- Documents
CREATE INDEX idx_documents_type ON documents(doc_type);
CREATE INDEX idx_documents_status ON documents(status);
CREATE INDEX idx_documents_number ON documents(doc_number);

-- Document links
CREATE INDEX idx_doc_links_document ON document_links(document_id);
CREATE INDEX idx_doc_links_target ON document_links(link_type, target_id);

-- Materials
CREATE INDEX idx_materials_type ON materials(material_type);
CREATE INDEX idx_trans_materials_transition ON transition_materials(transition_id);

-- Customer aliases
CREATE INDEX idx_customer_aliases_alias ON customer_aliases(alias);
```

---

## Ключевые запросы (Retrieval API)

### findPersonByName
```sql
SELECT p.*, o.short_name as org_name,
  GROUP_CONCAT(pd.doc_type || ' №' || pd.doc_number || ' от ' || pd.doc_date) as current_docs
FROM people p
LEFT JOIN organizations o ON p.org_id = o.id
LEFT JOIN person_documents pd ON pd.person_id = p.id AND pd.is_current = 1
WHERE p.surname LIKE ? OR p.full_name LIKE ?
GROUP BY p.id;
```

### findPersonRoleHistory
```sql
SELECT pra.role, o.short_name as object_name, pra.assigned_at, pra.removed_at,
  pd.doc_type, pd.doc_number, pd.doc_date
FROM person_role_assignments pra
LEFT JOIN objects o ON pra.object_id = o.id
LEFT JOIN person_documents pd ON pra.person_doc_id = pd.id
WHERE pra.person_id = ?
ORDER BY pra.assigned_at DESC;
```

### findTransitionsByObject
```sql
SELECT t.*, ts_list.signatories
FROM transitions t
LEFT JOIN (
  SELECT transition_id,
    GROUP_CONCAT(role || ':' || person_id) as signatories
  FROM transition_signatories GROUP BY transition_id
) ts_list ON ts_list.transition_id = t.id
WHERE t.object_id = ?
ORDER BY t.created_at DESC;
```

### findReusablePipeDocs
```sql
SELECT d.*, m.name as material_name, dl.relation
FROM documents d
JOIN document_links dl ON dl.document_id = d.id AND dl.link_type = 'material'
JOIN materials m ON dl.target_id = m.id
WHERE m.material_type = 'pipe'
  AND d.status != 'rejected'
  AND dl.target_id IN (
    SELECT material_id FROM transition_materials tm
    JOIN transitions t ON tm.transition_id = t.id
    WHERE t.object_id = ?
  );
```

### getBaseKnowledgeForDraft
```sql
-- Last finalized transition on object + its signatories + docs
SELECT t.*, ts.role, ts.person_id, p.full_name, p.position, o.short_name as org_name,
  pd.doc_type as person_doc_type, pd.doc_number as person_doc_number
FROM transitions t
JOIN transition_signatories ts ON ts.transition_id = t.id
JOIN people p ON ts.person_id = p.id
LEFT JOIN organizations o ON p.org_id = o.id
LEFT JOIN person_documents pd ON ts.person_doc_id = pd.id
WHERE t.object_id = ? AND t.status = 'finalized'
ORDER BY t.created_at DESC
LIMIT 20;
```

---

## Draft strategy (temporary bridge)

Intake drafts (`intake-drafts/*.json`) remain in JSON during Phase 2-3:
- Drafts are short-lived, high-churn, session-bound
- SQLite holds finalized knowledge only
- When draft is finalized → Transition + related entities written to SQLite
- Full draft migration to SQLite deferred until retrieval/reasoning is stable

---

## Code vs Skill boundary

### Code (deterministic, testable)
- DB schema, migrations, client
- All repositories and retrieval queries
- Draft lifecycle (create, update, finalize, delete)
- Validation (required fields, blockers, date checks)
- Conflict storage and state machine
- Generation (Excel rendering)
- Telegram handlers and session state
- File management and naming state

### Claude skills (reasoning, context-dependent)
- `gnb-intake-reasoning` — understand free text, detect intent, extract entities
- `gnb-draft-advisor` — decide what to auto-fill, reuse, or ask about
- `gnb-conflict-resolver` — explain conflicts, propose resolutions
- `gnb-review-narrator` — generate owner-facing review summaries

### Interaction pattern
```
1. Code: detect context (active draft, session state)
2. Code: perform retrieval (SQL queries → structured results)
3. Code: assemble payload (draft + retrieval context + policy)
4. Skill: reason over payload → return structured JSON
5. Code: validate JSON → apply to draft/DB
```

---

## Миграция с текущих JSON stores

| JSON store | → SQLite таблицы |
|---|---|
| gnb-customers.json / customers.json | customers, customer_aliases, objects |
| gnb-people.json / people.json | people, person_documents |
| transitions/*.json | transitions, transition_signatories, transition_orgs, transition_materials |
| intake-drafts/*.json | **remains JSON** (temporary bridge) |
| source tracking in drafts | documents, document_links |

---

## Технология

- **ORM**: better-sqlite3 + drizzle-orm (sync, fast, TypeScript-native)
- **DB file**: `.gnb-memory/gnb.db`
- **Migrations**: drizzle-kit
- **Backup**: copy file
