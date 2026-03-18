# Template Roadmap

Goal: produce one final master workbook so DB/domain data lands in a single `00 DATA` sheet and all print sheets read from it via formulas.

Working file:

- `C:\Users\kubko\projects\gnb-bot\templates\GNB-master-template-v2.xlsx`

Reference files:

- `C:\Users\kubko\YandexDisk\Работа\Крафт\2 Акты ЗП ГНБ 11-11 изм2.xls`
- `C:\Users\kubko\YandexDisk\Работа\Крафт\АОСР ОЭК-ГНБ 11-11 изм2..xls`
- `C:\Users\kubko\YandexDisk\Работа\Крафт\Марьино\5-5 и 6-6\2 Акты ЗП ГНБ 5-5.xls`
- `C:\Users\kubko\YandexDisk\Работа\Крафт\Марьино\5-5 и 6-6\2 Акты ЗП ГНБ 6-6.xls`
- `C:\Users\kubko\YandexDisk\Работа\Крафт\Марьино\5-5 и 6-6\АОСР ОЭК-ГНБ 5-5..xls`
- `C:\Users\kubko\YandexDisk\Работа\Крафт\Марьино\5-5 и 6-6\АОСР ОЭК-ГНБ 6-6..xls`

## Phase T0 — Freeze Facts

- [x] Find real source sheets in acts/AOSR examples
- [x] Confirm acts already use a data-sheet pattern
- [x] Confirm AOSR is still hybrid
- [x] Collect repeated examples from 11-11, 5-5, 6-6
- [x] Record current architecture in docs

Exit criteria:

- We know what is stable across real files.

## Phase T1 — Canonical DATA Schema

- [x] Create separate master workbook for redesign
- [x] Add `00 DATA` sheet
- [x] Define canonical field groups
- [x] Document field map: key -> acts target -> AOSR target
- [ ] Expand field map with helper/derived fields where needed
- [ ] Mark raw fields vs formatted fields explicitly everywhere

Exit criteria:

- `00 DATA` is the agreed source of truth on paper and in workbook structure.

## Phase T2 — Acts Compatibility Layer

- [ ] Rewire `02 Acts - Data` to read from `00 DATA`
- [ ] Preserve downstream formulas on acts pages
- [ ] Verify acts pages still render structurally correct
- [ ] Remove stale/unused cells from acts data layer if safe
- [ ] Identify and repair all `#REF!` in acts pages
- [ ] Remove external links from acts pages

Exit criteria:

- All acts sheets are internally fed by `00 DATA` through `02 Acts - Data` or directly.

## Phase T3 — AOSR Compatibility Layer

- [ ] Rewire `13 AOSR - Data` to read from `00 DATA`
- [ ] Move all compact AOSR raw fields to formulas from `00 DATA`
- [ ] Convert `14 AOSR - Page 1` to read from `13 AOSR - Data` / `00 DATA`
- [ ] Convert `15 AOSR - Page 2` to read from `13 AOSR - Data` / `00 DATA`
- [ ] Eliminate page-to-page duplication unless layout requires it
- [ ] Eliminate all workbook-external links from AOSR pages

Exit criteria:

- AOSR pages no longer depend on legacy external workbook state or direct runtime hardcoding.

## Phase T4 — Consistency and Cleanup

- [ ] Ensure signatory mapping is consistent across acts and AOSR
- [ ] Ensure organization mapping is consistent across acts and AOSR
- [ ] Ensure object/title/project/address fields have one canonical source
- [ ] Ensure materials and pipe mapping are deterministic
- [ ] Ensure dates are derived from one canonical set of raw fields
- [ ] Ensure optional sign3 behavior is explicit and stable

Exit criteria:

- One field means one thing everywhere.

## Phase T5 — Quality Gate

- [ ] Workbook opens cleanly
- [ ] No external workbook links remain
- [ ] No `#REF!` remain
- [ ] No hidden dependence on old split-template architecture
- [ ] Print sheets still look structurally correct
- [ ] `00 DATA` can be inspected by a human and understood

Exit criteria:

- Template is ready for renderer adoption planning.

## Phase T6 — Runtime Adoption Prep

- [ ] Document exact renderer changes needed
- [ ] Document whether one output file or two exports should be generated
- [ ] Document which current template files can be retired
- [ ] Keep runtime untouched until explicit go-ahead

Exit criteria:

- We have a clean handoff from template work to renderer/runtime work.
