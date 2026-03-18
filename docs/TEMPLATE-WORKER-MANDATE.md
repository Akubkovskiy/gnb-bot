# Template Worker Mandate

## Mission

Work autonomously on the Excel template track for GNB Bot.

Do not interrupt the owner unless there is a real blocker.
Do not interfere with Claude's runtime/debug work.
Do not change the live runtime templates until the new master template is stable.

## Main Goal

Produce a final master workbook so that:

1. database/domain data lands in one canonical `DATA` sheet
2. all print sheets read from that `DATA` sheet via formulas
3. no external workbook links remain
4. no broken `#REF!` links remain
5. both internal acts and AOSR can be generated from the same source of truth

## Non-Goals For Now

- do not wire the new workbook into runtime yet
- do not replace current production/stage templates yet
- do not redesign Telegram UX
- do not touch bot logic unless absolutely needed for template mapping reference
- do not block Claude's bot debugging work

## Working Files

Primary working workbook:

- `C:\Users\kubko\projects\gnb-bot\templates\GNB-master-template-final.xlsx`

Reference source templates:

- `C:\Users\kubko\projects\gnb-bot\templates\Акты ГНБ шаблон v2.xlsx`
- `C:\Users\kubko\projects\gnb-bot\templates\АОСР шаблон.xlsx`

Reference real-world correct outputs:

- `C:\Users\kubko\YandexDisk\Работа\Крафт\2 Акты ЗП ГНБ 11-11 изм2.xls`
- `C:\Users\kubko\YandexDisk\Работа\Крафт\АОСР ОЭК-ГНБ 11-11 изм2..xls`

Reference code:

- `C:\Users\kubko\projects\gnb-bot\src\renderer\internal-acts.ts`
- `C:\Users\kubko\projects\gnb-bot\src\renderer\aosr.ts`
- `C:\Users\kubko\projects\gnb-bot\src\renderer\cell-maps.ts`
- `C:\Users\kubko\projects\gnb-bot\src\domain\types.ts`
- `C:\Users\kubko\projects\gnb-bot\src\domain\formatters.ts`

Reference docs:

- `C:\Users\kubko\projects\gnb-bot\docs\TEMPLATE-UNIFICATION-PLAN.md`

## Architectural Rules

1. One canonical workbook.
2. One canonical `00 DATA` sheet.
3. Bot/domain layer should ultimately write only to `00 DATA`.
4. Print sheets must read from `00 DATA` directly or via stable internal helper formulas.
5. Avoid page-to-page duplication unless it is strictly layout-related.
6. Eliminate all external workbook links.
7. Eliminate all `#REF!` links.
8. Preserve print practicality.

## Safe Delivery Strategy

Work only in:

- `GNB-master-template-final.xlsx`

Create helper scripts/docs if needed, but do not touch the current runtime template names.

## Phase Sequence

### T1. Freeze canonical field set

Build and maintain the canonical field map for `00 DATA`:

- identity
- dates
- organizations
- signatories
- pipe/materials
- GNB params
- helper formatted strings

### T2. Rewire acts data compatibility

Make `02 Acts - Data` read from `00 DATA`.

Goal:

- downstream acts pages keep working
- acts pages do not need direct runtime writes

### T3. Rewire AOSR data compatibility

Make `13 AOSR - Data` read from `00 DATA`.

Then move AOSR page formulas to depend on:

- `13 AOSR - Data`
- or directly `00 DATA`

### T4. Remove hardcoded AOSR content

Gradually replace direct value cells in AOSR pages with formulas from the data layer.

### T5. Remove broken and external links

Before any runtime adoption:

- no external workbook references
- no `#REF!`

### T6. Prepare runtime adoption notes

Only when the workbook is stable:

- document exact renderer changes required
- do not apply them yet unless explicitly requested

## Quality Gates

Before considering the template ready:

1. workbook opens cleanly
2. all sheets present and named clearly
3. no external workbook links
4. no `#REF!`
5. acts pages can be traced back to `00 DATA`
6. AOSR pages can be traced back to `00 DATA`
7. printed sheets still look structurally correct

## Self-Check Before Every Change

1. Does this move the workbook closer to one canonical data layer?
2. Am I editing only the separate master template?
3. Am I avoiding interference with Claude's runtime work?
4. Does this reduce duplication instead of adding another mapping layer?
5. Will this make DB -> Excel filling simpler later?

If the answer is no or unclear, simplify the change.

## What To Produce

The final output of this track should be:

1. a stable master workbook
2. a documented canonical data map
3. a list of renderer changes needed later
4. zero dependence on the legacy split-template architecture
