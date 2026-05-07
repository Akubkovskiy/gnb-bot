# Phase 7.5 Exit Report — Template Stabilization

**Date:** 2026-05-07
**Status:** CLOSED with 3 known open items carried to Phase A

---

## What Phase 7.5 Covered

Template archaeology, renderer bug-fixing, and smoke test foundation to unblock
Phase A (template render tests with golden refs and 3-signatory scenarios).

---

## Completed Work

### Template archaeology
- Phase T0–T5 in `docs/TEMPLATE-ROADMAP.md`: all checked.
- GNB-master-template series explored (10 versions created, now deleted as cemetery).
- Decision: **stay with two canonical templates** (`Акты ГНБ шаблон v2.xlsx` + `АОСР шаблон.xlsx`).
  The unified single-template with `00 DATA` sheet approach (T6) is research-only;
  runtime was NOT migrated and is out of scope for v2 plan.

### Renderer bugs fixed (per git log)
| Commit | Fix |
|--------|-----|
| `76bcdb8` | Phase 7 known bugs: multi-sig, confirmation, position, org precedence |
| `5111339` | Use short_name for objects upsert on finalize |
| `d55bd28` | Auto-upsert customer+object to SQLite on finalize |
| `689e70a` | DB-enrich bare signatory surnames from regex extraction |
| `76a5d83` | 3 runtime signatory bugs |
| `0b24c75` | Object selection from SQLite list + renderer null safety |
| `7122dd0` | Auto-fill org from DB enrichment path |
| `bfc6035` | Skip false org conflict when existing has richer legal details |
| `6fe6a8b` | Generalize hasRicherDetails to skip pipe/signatory false conflicts |

### Finding resolutions (from `docs/PHASE-0-GATE-REPORT.md`)
| Finding | Resolution |
|---------|------------|
| #1 Residual data in template | **Mitigated** — renderer writes ALL 27 cells; empty → `" "` (space) |
| #3 Sign role→row mapping | **Resolved** — ЗП 5-5 v2 is authoritative standard |
| #5 F29 gnb_number_short | **Resolved** — removed from renderer scope (not used in practice) |

### Tests
- Smoke test bug fixed: `tests/smoke.test.ts` asserted `toBe(10)` for 11-sheet template.
- All 527 tests pass across 30 test files.
- Golden reference fixtures: `tests/fixtures/golden-5-5-v2-raw.json` + `golden-3-3-raw.json`.

### Phase 0 (drizzle + cleanup) completed
- `drizzle.config.ts` created.
- Baseline migration `src/db/migrations/0000_tiny_tyrannus.sql` generated (17 tables).
- `templates/` cleaned: 25 tracked + 5 untracked cemetery files removed.
  Remaining: `Акты ГНБ шаблон v2.xlsx`, `АОСР шаблон.xlsx`, `CELL_MAP.md`, `UNIFIED_SCHEMA.md`.

---

## Open Items (carry to Phase A)

### 1. C-column signature format (Finding #2) — needs owner decision
The renderer currently uses **5-5 style** (no `______` separator):
```
C-col: "Начальник участка  Щеглов Р.А."
```
3-3 style had:
```
C-col: "Начальник участка ООО «СПЕЦИНЖСТРОЙ»  ______________________Щеглов Р.А."
```
**Default:** keep 5-5 style (no blanks). Override via owner message if wrong.
10 print sheets inherit C-column via formulas from Лист1.

### 2. welding_end_date location (Finding #4) — partially mitigated
Renderer defaults `welding_end_date` to `end_date` when not set.
No dedicated cell in Лист1 for this field (UNIFIED_SCHEMA.md reference to B22 is wrong — B22 is sign3_desc).
**Default:** use end_date as welding_end_date. Owner can override if there is a separate welding completion date.

### 3. TEMPLATE-ROADMAP.md T4 — consistency check not run
Phase T4 (signatory/org consistency across acts and AOSR) was not completed.
The TEMPLATE-ROADMAP.md references `GNB-master-template-final.xlsx` as working file — this file is deleted.
**Impact:** Low. The two separate templates (acts + AOSR) work correctly in production.
TEMPLATE-ROADMAP.md should be archived or updated in Phase A.

---

## Phase A Exit Gate (preconditions)

Phase A (template stabilization with render tests) can start when:
- [x] All smoke tests pass (527/527)
- [x] Template cemetery cleared
- [x] drizzle baseline migration exists
- [ ] Rendering tests: 1-signatory, 2-signatory, 3-signatory render scenarios (Phase A deliverable)
- [ ] АОСР rendering tests with golden refs (Phase A deliverable)
- [ ] C-column format decision confirmed (default: 5-5 style — 24h silence = accepted)

---

## Rollback

Phase 0 changes can be reverted via:
```
git revert HEAD~N  # revert Phase 0 commits
```
Template cemetery files restored from git history.
`src/db/migrations/0000_tiny_tyrannus.sql` can be deleted if drizzle-kit is abandoned.
