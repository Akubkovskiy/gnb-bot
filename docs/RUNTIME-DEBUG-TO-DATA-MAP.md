# Runtime / Debug To DATA Map

Goal: explicitly map intake/debug field names and final `Transition` payload fields to the canonical Excel `00 DATA` keys in the unified template.

Current template target:

- `C:\Users\kubko\projects\gnb-bot\templates\GNB-master-template-v4.xlsx`

Debug / intake sources:

- `C:\Users\kubko\projects\gnb-bot\src\intake\intake-types.ts`
- `C:\Users\kubko\projects\gnb-bot\src\intake\debug-view.ts`
- `C:\Users\kubko\projects\gnb-bot\src\domain\types.ts`
- `C:\Users\kubko\projects\gnb-bot\src\renderer\internal-acts.ts`
- `C:\Users\kubko\projects\gnb-bot\src\renderer\aosr.ts`

## Principle

There are 3 layers:

1. Intake/debug field names
2. Final `Transition` payload fields
3. Canonical Excel `00 DATA` keys

The template must ultimately align with layer 2, but debug validation starts from layer 1.

## Identity

| Intake/debug field | Transition field | DATA key | Notes |
|---|---|---|---|
| `customer` | `customer` | routing only / not print-first | routing context, not primary print field |
| `object` | `object` | routing only / not print-first | routing context |
| `object_name` | `object_name` | `object_name` | acts visual field |
| `title_line` | `title_line` | `title_line` | AOSR object title |
| `gnb_number` | `gnb_number` | `gnb_number` | full printed number |
| `gnb_number_short` | `gnb_number_short` | `gnb_number_short` | short printed number |
| `address` | `address` | `address` | shared |
| `project_number` | `project_number` | `project_number` | raw project number |
| n/a derived | `project_number` + org context | `project_doc_line` | formatted AOSR helper |
| `executor` | `executor` | `executor` | acts-only today |

## Dates

| Intake/debug field | Transition field | DATA key |
|---|---|---|
| `start_date` | `start_date` | `start_date_day`, `start_date_month`, `start_date_year`, `start_date_internal` |
| `end_date` | `end_date` | `end_date_day`, `end_date_month`, `end_date_year`, `end_date_internal` |
| `act_date` | `act_date` or derived from `end_date` | `act_date_day`, `act_date_month`, `act_date_year`, `act_date_internal` |

## Organizations

| Intake/debug field | Transition field | DATA key |
|---|---|---|
| `organizations.customer` | `organizations.customer` | `org_customer_display`, `org_customer_full_aosr` |
| `organizations.contractor` | `organizations.contractor` | `org_contractor_display`, `org_contractor_full_aosr` |
| `organizations.designer` | `organizations.designer` | `org_designer_display`, `org_designer_full_aosr` |

## Signatories

| Intake/debug field | Transition field | DATA key |
|---|---|---|
| `signatories.sign1_customer` | `signatories.sign1_customer` | `sign1_desc`, `sign1_line`, `sign1_full_aosr`, `sign1_name` |
| `signatories.sign2_contractor` | `signatories.sign2_contractor` | `sign2_desc`, `sign2_line`, `sign2_full_aosr`, `sign2_name` |
| `signatories.sign3_optional` | `signatories.sign3_optional` | `sign3_desc`, `sign3_line`, `sign3_full_aosr`, `sign3_org_name`, `sign3_name` |
| `signatories.tech_supervisor` | `signatories.tech_supervisor` | `tech_desc`, `tech_line`, `tech_full_aosr`, `tech_name` |

## Pipe / Materials

| Intake/debug field | Transition field | DATA key |
|---|---|---|
| `pipe` | `pipe` | `pipe_mark`, `pipe_diameter_display` |
| `materials` | `materials` | `materials_aosr` |

## GNB Parameters

| Intake/debug field | Transition field | DATA key |
|---|---|---|
| `gnb_params.profile_length` | `gnb_params.profile_length` | `profile_length` |
| `gnb_params.plan_length` | `gnb_params.plan_length` | `plan_length` |
| `gnb_params.pipe_count` | `gnb_params.pipe_count` | `pipe_count` |
| `gnb_params.drill_diameter` | `gnb_params.drill_diameter` | `drill_diameter` |
| n/a derived | `gnb_params.configuration` | `configuration` |
| n/a derived | `profile_length * pipe_count` | `total_pipe_length` |

## AOSR Helper Strings

These are not primary intake fields. They are derived from the final payload and/or formatted helper strings.

| DATA key | Source |
|---|---|
| `aosr_page1_caption` | `gnb_number_short` |
| `aosr_page2_caption` | `gnb_number_short` |
| `aosr_object_caption` | `gnb_number_short` + `address` |
| `aosr_work_description` | `gnb_number_short` + lengths + diameter + address |
| `drawing_caption` | `gnb_number_short` + `address` |
| `subsequent_works` | default or runtime constant |

## Gaps Still To Resolve

These are the remaining semantic weak spots before final handoff:

1. `customer` and `object` are routing fields in intake/debug, but not yet first-class print DATA keys.
2. `project_doc_line` is still only a helper placeholder, not fully normalized from runtime formatting.
3. AOSR helper strings need a stable Russian-language construction path that is not brittle in Excel COM.
4. Short signatory name fields (`sign1_name`, `sign2_name`, etc.) must be aligned with runtime `full_name` formatting.
5. `materials_aosr` must be validated against real runtime output, not just left structurally present.

## Exit Condition

This mapping is considered complete when:

- every debug/review field needed for generation has a deterministic DATA target
- all renderer-relevant `Transition` fields are represented in `00 DATA`
- helper strings are derived reproducibly
- manual stage comparison of `/review_gnb_debug` vs generated workbook shows no missing semantic fields
