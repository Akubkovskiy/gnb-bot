# Template Unification Plan

## Goal

Move from two loosely related Excel templates to one master workbook with:

- one data sheet
- print sheets that only read from the data sheet via formulas
- no external workbook links
- no runtime dependence on hardcoded values inside AOSR pages

Current master draft file:

- `C:\Users\kubko\projects\gnb-bot\templates\GNB-master-template-v3.xlsx`

Reference source files:

- `C:\Users\kubko\YandexDisk\Работа\Крафт\2 Акты ЗП ГНБ 11-11 изм2.xls`
- `C:\Users\kubko\YandexDisk\Работа\Крафт\АОСР ОЭК-ГНБ 11-11 изм2..xls`

## What Is Confirmed

### Internal acts already follow the right pattern

In the real acts workbook:

- `Лист1` is the data/source sheet
- downstream sheets pull from `Лист1` via formulas

Examples:

- `Акт освид!E31 = Лист1!B20`
- `Опись!B7 = Лист1!$B$25`
- `Опись!B20 = Лист1!B24`

This means the acts workbook is already architecturally close to the target model.

### AOSR is only partially data-driven

In the real AOSR workbook:

- `Лист1` contains compact structured data:
  - GNB number
  - profile length
  - pipe count
  - address
  - start / end / act dates
- but `АОСР (1)` still contains many hardcoded or directly written values
- `АОСР (2)` partly reads from `АОСР (1)` via formulas

Examples:

- `АОСР (1)!A39 = CONCATENATE("Закрытого перехода методом ГНБ №", Лист1!B2, ...)`
- `АОСР (2)!A4 = 'АОСР (1)'!A4:AJ4`
- `АОСР (2)!A7 = 'АОСР (1)'!A7:AJ7`

So AOSR is hybrid:

- some fields come from `Лист1`
- some fields are filled directly into page sheets
- page 2 depends on page 1

## Main Architectural Conclusion

The correct target model is:

1. one master workbook
2. one `DATA` sheet
3. bot writes only to `DATA`
4. all other print sheets pull from `DATA` or from intermediate formula cells

This should apply to both:

- internal acts
- AOSR

## Current Problems In The Master Workbook

The first merged file was only a container for redesign.

The current `v3` draft is already much closer to the target:

- `00 DATA` is now a real key/value layer
- `02 Acts - Data` reads from `00 DATA`
- `13 AOSR - Data` reads from `00 DATA`
- AOSR pages no longer depend on workbook-external links

Remaining work is now mostly cleanup and final consistency, not raw merging.

The template is **not yet final** because:

- helper/derived fields still need cleanup and standardization
- some page-to-page duplication remains where layout historically depended on it
- final print validation still needs a human pass

That means the master workbook is now good for structured redesign work, but not yet ready for runtime adoption.

## Field Groups For The Future DATA Sheet

The future `DATA` sheet should be explicit and grouped.

### Group A. Identity

- `gnb_number`
- `gnb_number_short`
- `title_line`
- `object_name`
- `address`
- `project_number`
- `executor`

### Group B. Dates

- `start_date_day`
- `start_date_month`
- `start_date_year`
- `end_date_day`
- `end_date_month`
- `end_date_year`
- `act_date_day`
- `act_date_month`
- `act_date_year`

Also add formatted helper cells for acts if needed:

- `start_date_internal`
- `end_date_internal`
- `act_date_internal`

### Group C. Organizations

- `org_customer_short`
- `org_customer_display`
- `org_customer_full_aosr`
- `org_contractor_display`
- `org_contractor_full_aosr`
- `org_designer_display`
- `org_designer_full_aosr`

### Group D. Signatories

For each signatory:

- short/display string for acts B-column
- position + name string for acts C-column
- full AOSR line
- short name
- optional org display

Suggested prefixes:

- `tech_*`
- `sign1_*`
- `sign2_*`
- `sign3_*`

### Group E. Pipe and materials

- `pipe_mark`
- `pipe_diameter_display`
- `pipe_diameter_mm`
- `pipe_quality_passport`
- `pipe_conformity_cert`
- `materials_aosr`

### Group F. GNB params

- `profile_length`
- `plan_length`
- `pipe_count`
- `total_pipe_length`
- `drill_diameter`
- `configuration`

### Group G. AOSR helper strings

- `aosr_closed_work_line`
- `aosr_project_doc_line`
- `aosr_subsequent_works`

## Safe Migration Strategy

### Phase T1. Freeze mapping

Before editing formulas:

- document current acts mapping
- document current AOSR mapping
- mark which values are raw
- mark which values are derived/formatted

### Phase T2. Build a new DATA sheet inside the master workbook

Do not reuse current `02 Acts - Data` or `13 AOSR - Data` as-is.
Create a new canonical sheet, for example:

- `00 DATA`

Then map both systems from that sheet.

### Phase T3. Rewire acts pages first

Acts are already closer to the goal.

Tasks:

- point all acts sheets to `00 DATA`
- preserve page layout and print behavior
- verify no regressions

### Phase T4. Rewire AOSR page 1

Move all direct value dependencies into `00 DATA`.

Replace page-1 hardcoded fill expectations with formulas from `00 DATA`.

### Phase T5. Rewire AOSR page 2

Prefer:

- page 2 -> page 1 only where layout duplication is intentional
- otherwise page 2 -> `00 DATA`

Goal:

- no external workbook links
- no runtime hardcoded page writes

### Phase T6. Only then update renderer

The runtime renderer should be changed only after the Excel model is stable.

## Important Constraints

### Do not wire this into runtime yet

The merged workbook is still exploratory.

Do not replace:

- `templates\Акты ГНБ шаблон v2.xlsx`
- `templates\АОСР шаблон.xlsx`

until the formula model is stable.

### Do not lose print practicality

The user may still want:

- separate print flows
- page-based printing
- two output files

This does not conflict with one master workbook.

We can still:

- keep one master workbook for filling
- export or duplicate outputs later if needed

## Next Recommended Step

Create the canonical `00 DATA` layout on paper first:

- row/column plan
- exact field names
- raw vs formatted values

Then rewire formulas sheet-by-sheet.
