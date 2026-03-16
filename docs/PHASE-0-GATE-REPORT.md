# Phase 0 Gate Report — Foundation Verification

Date: 2026-03-15
Status: **PASS with 3 findings requiring owner decision**

---

## 0.1 Template Verification — PASS

| File | Sheets | Formulas | ExcelJS | Status |
|------|--------|----------|---------|--------|
| `Акты ГНБ шаблон v2.xlsx` | 11 | 163 | Reads OK | **Active template** |
| `АОСР шаблон.xlsx` | 3 | 36 | Reads OK | **Active template** |
| `Акты ОЭК шаблон.xlsx` | 10 (no "Акт освид") | 148 | Reads OK | **legacy_candidate** — missing 1 sheet vs v2 |

Key formula verification:
- Internal acts: `E31=C31*D31`, `H31=E31/13` — confirmed
- АОСР: `B4=C3*B3` — confirmed
- All 10 secondary sheets reference `Лист1!` via formulas — confirmed (163 formula refs total)

**АОСР template is clean** (only 1 formula, no residual data).
**Internal acts template v2 is NOT clean** — contains data from ГКУ «УДМС» project (see Finding #1).

---

## 0.2 Golden Reference Extraction — PASS

Extracted 2 fixtures to `tests/fixtures/`:
- `golden-5-5-v2-raw.json` — ЗП 5-5 (v3 layout, authoritative)
- `golden-3-3-raw.json` — ЗП 3-3 (older layout, reference only)

### Finding #1: Template contains residual data (CRITICAL for renderer)

Template `Акты ГНБ шаблон v2.xlsx` Лист1 has pre-filled data from a different project:
- B3: "ГНБ 10-1С г. Москва, ул. Кантемировская, д.60"
- B14: "ГКУ «УДМС»" (not ОЭК!)
- B10/B15: "ООО «Резонанс-Энерго»"

**Impact:** Renderer MUST overwrite ALL data cells, not just non-empty ones. If renderer skips a cell because the new value is empty, old data from template will leak through.

**Mitigation:** Renderer must explicitly write `" "` (space) to any cell where transition data is null/empty. Already covered by RFC v1.1 rule for sign3, but must extend to ALL 26 data cells.

### Finding #2: Layout version difference between golden refs (CRITICAL for formatter)

| Aspect | ЗП 3-3 (older) | ЗП 5-5 v2 (current) | CLAUDE.md says |
|--------|----------------|---------------------|----------------|
| B3 title_line | "ЗП № 3-3 г. Москва, Огородный..." (number+address) | "«Выполнение работ по прокладке КЛ..." (full project name) | full project name |
| B14 customer | "АО «ОЭК»" (no department) | "СВРЭС АО «ОЭК»" (dept+org) | dept+short_name |
| B20 sign1_desc | Full: "Представитель АО «ОЭК» Мастер по ЭРС СВРЭС Акимов Ю.О." | Org only: "Представитель АО «ОЭК»" | unclear |
| C20 sign1_line | "Представитель АО «ОЭК» ____Акимов Ю.О." | "Мастер по ЭРС СВРЭС  Коробков Ю.Н." (no ____) | with ____ |
| B21 sign2 | СПЕЦИНЖСТРОЙ (субподряд) | ОЭК Стройтрест (подряд) | подрядчик |
| B22 sign3 | ОЭК Стройтрест (подряд) | СПЕЦИНЖСТРОЙ (субподряд) | субподрядчик |
| B23 tech | = B20 (same person, no separate tech) | "Представитель технического надзора АО «ОЭК»" | separate person |
| C23 tech_line | empty | "Главный специалист ОТН  Гайдуков Н.И." | with data |
| C columns | With ____ separator | Without ____ separator | With ____ |

**Conclusion:** ЗП 5-5 v2 is the **authoritative** v3 layout. ЗП 3-3 follows an older format.

**Decision needed:** Which C-column format?
- 3-3 style: `"Начальник участка ООО «СПЕЦИНЖСТРОЙ»  ______________________Щеглов Р.А."`
- 5-5 style: `"Начальник участка  Щеглов Р.А."` (no ____)

### Finding #3: Sign roles not fixed to rows (IMPORTANT)

In ЗП 3-3, row 21 (sign2) = СПЕЦИНЖСТРОЙ (subcontractor), row 22 (sign3) = ОЭК Стройтрест (contractor).
In ЗП 5-5, row 21 (sign2) = ОЭК Стройтрест (contractor), row 22 (sign3) = СПЕЦИНЖСТРОЙ (subcontractor).

CLAUDE.md defines: sign2 = подрядчик, sign3 = субподрядчик. This matches ЗП 5-5.

**Conclusion:** ЗП 3-3 was filled before the role→row mapping was standardized. The current standard (CLAUDE.md + ЗП 5-5) is correct:
- Row 21 (sign2) = подрядчик (АНО «ОЭК Стройтрест»)
- Row 22 (sign3) = субподрядчик (ООО «СПЕЦИНЖСТРОЙ», optional)

### Finding #4: welding_end_date location unknown

UNIFIED_SCHEMA.md mentions `welding_end_date` at B22, but B22 is sign3_desc. The `Сварка трубы` sheet has 18 formulas referencing Лист1 but none reference a dedicated welding date cell. No welding date found in either golden reference.

**Status:** `awaiting_owner_context` — where does welding_end_date come from?

### Finding #5: F29 (gnb_number_short) is empty in all files

UNIFIED_SCHEMA.md says F29 should contain gnb_number_short. Both golden refs show F29=null. The Лист1 structure has no data at row 29 except the "ПАРАМЕТРЫ ГНБ" header.

**Status:** F29 is not used in practice. Remove from renderer scope.

---

## 0.3 Test Runner — PASS

- vitest ^4.1.0 installed
- 7 smoke tests pass (templates, formulas, fixtures, formula refs)
- `npx vitest run` executes in <1s

---

## Gate Summary

| Gate | Status | Action |
|------|--------|--------|
| Templates readable by ExcelJS | **PASS** | — |
| Formulas preserved | **PASS** | — |
| Golden fixtures extracted | **PASS** | 2 JSON files in tests/fixtures/ |
| Test runner working | **PASS** | vitest, 7 tests |
| Template is clean | **FAIL** — residual data | Renderer must overwrite ALL cells |
| Layout version standardized | **NEEDS DECISION** | Owner: C-column format (with/without ____?) |
| welding_end_date location | **NEEDS DECISION** | Owner: where does this date come from? |
| F29 gnb_number_short | **RESOLVED** | Remove from scope (not used) |
| Sign role→row mapping | **RESOLVED** | ЗП 5-5 = authoritative standard |

---

## Blocking Questions Before Phase 1

**Q-GATE-1:** C-column signature format — with `______` separator or without?
- 3-3 uses: `"Начальник участка ООО «СПЕЦИНЖСТРОЙ»  ______________________Щеглов Р.А."`
- 5-5 uses: `"Начальник участка  Щеглов Р.А."`
- These go to 10 different sheets via formulas. Pick one.

**Q-GATE-2:** `welding_end_date` — is this field needed? If yes, which cell/row? It's not present in either golden reference and doesn't have a dedicated cell in Лист1.

**Q-GATE-3:** B-column signatory format — full description (3-3 style: org+position+name all in B) or split (5-5 style: org description in B, position+name in C)?

All three can be answered with: **"Use ЗП 5-5 v2 format for everything"** — that's the simplest path.

---

## Files Created

| File | Purpose |
|------|---------|
| `tests/fixtures/golden-5-5-v2-raw.json` | Golden reference data from ЗП 5-5 |
| `tests/fixtures/golden-3-3-raw.json` | Reference data from ЗП 3-3 (older format) |
| `tests/smoke.test.ts` | 7 foundation smoke tests |
| `package.json` | Updated with vitest devDependency |
