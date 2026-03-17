# GNB Bot Roadmap: Database + Retrieval + Claude Skills

Status: planning
Date: 2026-03-17
Primary goal:

Build `gnb-bot` as a knowledge-driven assistant:

`owner text/voice -> code retrieval from DB -> Claude skill reasoning -> structured result -> draft/review -> generation`

## 1. Product Goal

The target system is not a regex-first parser.

The target system is:
- SQLite as long-term memory
- retrieval and validation in code
- Claude Code skills as reasoning/playbooks
- bot runtime as deterministic executor

The bot must eventually support natural requests like:
- "what do we have for Gaydukov?"
- "reuse the same pipe passport as on the previous transition"
- "on this object the tech supervisor is Gaydukov"
- "the site manager is Shcheglov from SPECINZHSTROY"
- "there is no Stroytrest on this object"

The target workflow is voice/text-first:
- the owner can call objects by working aliases
- the owner can upload an executive scheme, pipe passport, and reference template
- the bot should extract what it can, reuse what already exists, and ask only for missing or changed data
- the bot should assemble a GNB passport for review before generation
- the bot should later place reused and new documents into the new transition storage/cloud structure

Reference product scenarios:
- `docs/GNB-TARGET-SCENARIOS.md`

## 2. Core Architecture

### 2.1 Storage layer

Must be SQLite-backed and hold:
- transitions
- documents
- people
- organizations
- materials
- provenance / field history
- conflict decisions
- document lineage

### 2.2 Retrieval layer

Must be deterministic code:
- repositories
- typed queries
- ranking and filtering
- no LLM inside retrieval

Examples:
- `findPersonByName(...)`
- `findDocsByPerson(...)`
- `findObjectHistory(...)`
- `findReusablePipeDocs(...)`
- `findReusableMaterialDocs(...)`

### 2.3 Reasoning layer

Must be implemented as Claude Code skills / playbooks.

Input:
- owner message
- current draft summary
- retrieval context from code
- policy / allowed actions

Output:
- structured JSON
- field updates
- reuse suggestions
- owner questions
- conflict explanations
- review narrative

### 2.4 Execution layer

Must stay in code:
- Telegram handlers
- draft lifecycle
- validation
- review building
- finalize
- render / generation
- file tracking

## 3. What Is Code and What Is Skill

### 3.1 Must stay code

- DB schema and migrations
- repositories and retrieval
- CRUD
- validation
- draft updates
- provenance persistence
- conflict persistence
- generation
- Telegram state machine

### 3.2 Runtime Claude skills

We do not need 15 tiny skills.

Core runtime skill set:
- `gnb-intake-reasoning`
- `gnb-draft-advisor`
- `gnb-conflict-resolver`
- `gnb-review-narrator`

Additional support skill:
- `gnb-knowledge-ingest`

### 3.3 Dev/support Claude skills

- `gnb-schema-evolution`
- `gnb-regression-doc-analysis`
- `gnb-reasoning-contract-review`

### 3.4 Important rule

Skills do not execute SQL directly.

Correct flow:
1. code detects context
2. code performs retrieval
3. code assembles structured payload
4. Claude skill reasons over the payload
5. code validates and applies the result

Important variation:
- `gnb-knowledge-ingest` may be used for standalone uploads and explicit "save data" commands
- it still does not write to DB directly
- it returns a structured ingest payload
- code asks missing linking questions such as:
  - which object does this belong to?
  - is this tied to a person, material, or transition?
  - should this be saved for future reuse?
- code then persists the result deterministically

## 4. Non-Negotiable Design Rules

The system must preserve:
- provenance for important field values
- owner decision history for conflicts
- person role history over time
- document lineage and reuse lineage

That means the schema must explicitly support:
- `field_values`
- `conflict_resolutions`
- `person_role_assignments`
- document lineage fields such as:
  - `origin`
  - `supersedes_document_id`
  - `reused_from_transition_id`

Important temporary bridge:
- `intake_drafts` may stay in JSON for the first DB phases
- this is a speed-oriented temporary bridge, not the final architecture
- Phase 1 must explicitly decide the draft strategy:
  - keep drafts in JSON during DB foundation
  - or move drafts into SQLite earlier
- default direction for now:
  - keep drafts in JSON during early DB rollout
  - keep finalized knowledge in SQLite
  - revisit full draft migration after retrieval/reasoning foundation is stable

## 5. Development Principle

Build phase by phase.

Each phase must:
- produce a real deliverable
- move the system toward DB + retrieval + reasoning
- avoid parser-thinking
- avoid hiding stable business logic inside one-off prompt strings

Before each subphase, Claude should self-check:
- Am I still building a knowledge-driven assistant?
- Am I putting retrieval in code and reasoning in skills?
- Am I accidentally building another parser layer?
- Will this step help future questions like "what do we have for Gaydukov?"
- Am I moving toward the target scenarios in `docs/GNB-TARGET-SCENARIOS.md`?

## 5.1 Product Reference Scenarios

The roadmap must be interpreted against a concrete target behavior set:
- new GNB from natural voice/text plus uploaded documents
- standalone "save data" document ingestion into DB
- retrieval question like "what do we have for Gaydukov?"
- reuse from previous transition/object
- delta workflow where a new GNB is mostly the same and only address/dates/lengths change
- final review, generation, and later storage/cloud placement

Use `docs/GNB-TARGET-SCENARIOS.md` as the reference document for these behaviors.

## 6. Detailed Phases

## Phase 1 - Patch RFC and Finalize the Knowledge Model ✅
Estimate: 1 day | **Completed: 2026-03-17**

Goal:
- align the RFC and roadmap with the real target architecture

Tasks:
- [x] audit `docs/RFC-SQLITE-KNOWLEDGE-MODEL.md`
- [x] add or confirm `field_values`
- [x] add or confirm `conflict_resolutions`
- [x] add or confirm `person_role_assignments`
- [x] add document lineage fields (origin, supersedes_document_id, reused_from_transition_id)
- [x] decide generic `document_links` vs generic + typed link tables → kept generic, sufficient
- [x] mark `intake_drafts outside SQLite` as temporary bridge only
- [x] define retrieval-oriented indexes (20 indexes)
- [x] document code vs skill boundary
- [x] document that skills do not query DB directly

Deliverables:
- [x] updated `docs/RFC-SQLITE-KNOWLEDGE-MODEL.md` — 16 tables, indexes, retrieval queries
- [x] updated `docs/ROADMAP-KNOWLEDGE-DB-LLM.md`
- [x] `testdata/real-docs/` — real test documents added

Done:
- [x] schema is implementation-ready
- [x] roadmap and RFC do not contradict each other

Human gate:
- [x] owner reviewed — approved to proceed to Phase 2

## Phase 2 - SQLite Foundation + Seed / Migration Bridge ✅
Estimate: 2-3 days | **Completed: 2026-03-17**

Goal:
- create the DB layer and first migration bridge without breaking current bot runtime

Tasks:
- [ ] choose the SQLite stack
- [ ] create `src/db/`
- [ ] create DB client/init
- [ ] create schema and migrations
- [ ] create shared DB types
- [ ] decide and document the draft strategy for the bridge period
- [ ] implement repositories for:
  - [ ] transitions
  - [ ] documents
  - [ ] people
  - [ ] organizations
  - [ ] materials
  - [ ] field values
  - [ ] conflict resolutions
  - [ ] person role assignments
  - [ ] generic/typed document links
  - [ ] name approvals if natural at this stage
- [ ] add repository tests
- [ ] create JSON -> SQLite seed/migration script for the first useful entities
- [ ] support bridge mode where JSON and SQLite can coexist safely
- [ ] keep current bot runtime unchanged

Deliverables:
- [ ] `src/db/client.ts`
- [ ] `src/db/schema.ts`
- [ ] `src/db/types.ts`
- [ ] `src/db/repositories/*`
- [ ] migration/bootstrap logic
- [ ] seed/migration bridge script
- [ ] DB tests

Done when:
- [ ] DB bootstraps cleanly
- [ ] repositories pass tests
- [ ] seed/migration bridge works on sample/current data
- [ ] current bot behavior is not broken

Human gate:
- [ ] owner reviews DB foundation after green tests only

## Phase 3 - Retrieval Layer ✅
Estimate: 2-3 days | **Completed: 2026-03-17**

Goal:
- make the DB useful through typed queries

Tasks:
- [ ] implement person lookup queries
- [ ] implement object history queries
- [ ] implement reusable document queries
- [ ] implement material queries
- [ ] implement latest signatory/supporting-doc queries
- [ ] add deterministic ranking rules
- [ ] add retrieval tests

Example retrievals:
- [ ] `findPersonByName`
- [ ] `findDocsByPerson`
- [ ] `findObjectHistory`
- [ ] `findReusablePipeDocs`
- [ ] `findReusableMaterialDocs`
- [ ] `findLatestSignatoryDocs`
- [ ] `findBaseCandidatesForDraft`

Done when:
- [ ] a question like "what do we have for Gaydukov?" can be answered from retrieval output

Human gate:
- [ ] owner can review retrieval examples against real data

## Phase 4 - Reasoning Layer + Runtime Skills ✅
Estimate: 2-3 days | **Completed: 2026-03-17**

Goal:
- make Claude reason over retrieval context and return structured updates
- define and implement the runtime skills as part of this phase, not as a separate design-only phase

Tasks:
- [ ] define and implement:
  - [ ] `gnb-intake-reasoning`
  - [ ] `gnb-draft-advisor`
  - [ ] `gnb-conflict-resolver`
  - [ ] `gnb-review-narrator`
- [ ] specify skill input payload contracts
- [ ] specify skill output JSON contracts
- [ ] define validation rules for skill outputs
- [ ] define fallback behavior
- [ ] create reasoning orchestrator in code
- [ ] wire retrieval context into skill inputs
- [ ] validate returned structured outputs
- [ ] support:
  - [ ] field updates
  - [ ] reuse suggestions
  - [ ] owner questions
  - [ ] conflict explanations
  - [ ] review narratives
- [ ] add mocked tests for skill outputs

Done when:
- [ ] DB-backed natural-language decisions become possible

Human gate:
- [ ] owner tests semantic inputs such as:
  - [ ] "on this object the tech supervisor is Gaydukov"
  - [ ] "the site manager from SPECINZH is Shcheglov"
  - [ ] "there is no Stroytrest"

## Phase 5 - Replace Regex-Heavy Text Path ✅
Estimate: 1 day | **Completed: 2026-03-17**

Goal:
- move free-text intake from parser-first to reasoning-first

Tasks:
- [ ] keep regex only as cheap helper/fallback
- [ ] route natural text through `gnb-intake-reasoning`
- [ ] use `gnb-draft-advisor` when DB-backed decisions are needed
- [ ] preserve deterministic validation
- [ ] add regression tests for old simple text patterns

Done when:
- [ ] messages like "Master po ERS SVRES AO OEK Akimov Yu.O." stop failing for semantic reasons

## Phase 6 - Conflict, Review, Reuse, and Knowledge Ingest UX
Estimate: 1 day

Goal:
- make the system explain itself and ask only the right questions
- add a standalone knowledge-ingest path for documents that should be saved into the DB even outside the active draft

Tasks:
- [ ] wire `gnb-conflict-resolver`
- [ ] wire `gnb-review-narrator`
- [ ] implement `gnb-knowledge-ingest` support flow
- [ ] support explicit owner commands like `save data`
- [ ] if a standalone document is uploaded, ask what object / person / material / transition it belongs to
- [ ] persist the linked document into DB for future retrieval/reuse
- [ ] update review sections:
  - [ ] inherited
  - [ ] changed
  - [ ] reused
  - [ ] unresolved conflicts
  - [ ] missing required fields
  - [ ] missing required docs
- [ ] add owner actions:
  - [ ] use new
  - [ ] keep old
  - [ ] use from DB
  - [ ] manual input
- [ ] test with real docs from `testdata/real-docs`

Done when:
- [ ] `/review_gnb` becomes an engineering summary, not a technical dump
- [ ] the bot can save useful standalone documents into DB for future reuse

## Phase 7 - Voice-Ready Input and UX Polish
Estimate: 1-2 days

Goal:
- support natural conversational input and reduce operator friction

Tasks:
- [ ] adapt reasoning to noisy conversational text
- [ ] treat voice transcript as the same semantic pipeline, not a separate parser path
- [ ] support object/customer aliases in voice/text understanding
- [ ] reduce message spam
- [ ] add menu/buttons for common DB-aware actions
- [ ] polish the owner interaction flow

Done when:
- [ ] the bot can handle natural spoken-like instructions much better than rigid parser input

## Phase 8 - Storage and Cloud Placement
Estimate: 1-2 days

Goal:
- make finalized and reused documents land in the correct transition storage structure

Tasks:
- [ ] define the transition storage layout
- [ ] copy or link reused documents into the new transition directory
- [ ] persist document placement decisions
- [ ] prepare cloud sync/upload integration point
- [ ] make sure generated files and reused evidence are discoverable from the transition

Done when:
- [ ] the bot not only uses documents logically, but also puts them in the right place for future work

## 7. Human Test Gates

Claude should interrupt the owner only at meaningful checkpoints:

Gate 1:
- RFC + schema finalized

Gate 2:
- SQLite foundation + seed/migration bridge implemented and green

Gate 3:
- retrieval works on real migrated/sample data

Gate 4:
- reasoning handles semantic owner messages

Gate 5:
- runtime integration / stage rehearsal

Gate 6:
- storage/cloud placement verified on a real transition

Outside these gates Claude should work autonomously unless blocked.

## 8. Peer Review and Team Mode

After every major phase, prepare the result for review by another agent or reviewer.

Review package should include:
- changed files
- risks
- what is still not wired to runtime
- what changed in architecture
- what should be tested manually next

Review questions:
- Are we still aligned with DB + retrieval + reasoning?
- Did implementation regress into parser-thinking?
- Is provenance preserved?
- Is stable logic in code and reasoning in skills?
- Are the skills reusable playbooks rather than one-off prompts?

## 9. Test Data Strategy

Use:
- `testdata/real-docs/`

Recommended layout:
- `testdata/real-docs/excel/`
- `testdata/real-docs/schemes/`
- `testdata/real-docs/pipe-passports/`
- `testdata/real-docs/certificates/`
- `testdata/real-docs/orders/`
- `testdata/real-docs/materials/`
- `testdata/real-docs/photos/`

Rules:
- real docs are for manual, stage, and regression checks
- small stable fixtures should live separately in `tests/fixtures/`
- architecture must not depend on lucky filenames

## 10. Recommended Order

1. Phase 1 - Patch RFC and finalize the knowledge model
2. Phase 2 - SQLite foundation + seed / migration bridge
3. Phase 3 - Retrieval layer
4. Phase 4 - Reasoning layer + runtime skills
5. Phase 5 - Replace regex-heavy text path
6. Phase 6 - Conflict, review, and reuse UX
7. Phase 7 - Voice-ready input and UX polish
8. Phase 8 - Storage and cloud placement

## 11. Highest-Value Path

For the fastest practical value, prioritize:
- Phase 1
- Phase 2
- Phase 3
- Phase 4

These phases unlock:
- "what do we have for Gaydukov?"
- "which pipe passports do we already have for this object?"
- "reuse the same as on the previous transition"
- "there is no Stroytrest"

## 12. Immediate Recommendation

Start with:
- Phase 1
- then Phase 2

Only after that move to retrieval and runtime skills.
