# Master Data Field Map

Canonical target workbook:

- `C:\Users\kubko\projects\gnb-bot\templates\GNB-master-template-final.xlsx`

Canonical source sheet:

- `00 DATA`

## Identity

| Field | Acts target | AOSR target | Notes |
|---|---|---|---|
| `gnb_number` | `B6`, `A31` | derived to short form | full value like `ЗП № 5-5` |
| `gnb_number_short` | derived or optional | `B2` | short value like `5-5` |
| `title_line` | `B3` | `A4` | long construction title |
| `object_name` | `B4` | optional/derived | visual object field for acts |
| `address` | `B5` | `B5`, page text refs | shared |
| `project_number` | `B7` | helper input | raw project number |
| `project_doc_line` | helper only | `A45` | full AOSR project-document string |
| `executor` | `B10` | optional | acts-only today |

## Dates

| Field | Acts target | AOSR target | Notes |
|---|---|---|---|
| `start_date_day` | derived | `C6` | |
| `start_date_month` | derived | `D6` | |
| `start_date_year` | derived | `E6` | |
| `end_date_day` | derived | `C7` | |
| `end_date_month` | derived | `D7` | |
| `end_date_year` | derived | `E7` | |
| `act_date_day` | derived | `C8` | |
| `act_date_month` | derived | `D8` | |
| `act_date_year` | derived | `E8` | |
| `start_date_internal` | `B8` | - | formatted string |
| `end_date_internal` | `B9` | - | formatted string |
| `act_date_internal` | `B11` | - | formatted string |

## Organizations

| Field | Acts target | AOSR target | Notes |
|---|---|---|---|
| `org_customer_display` | `B14` | - | department + short name |
| `org_customer_full_aosr` | - | `A7` | full requisites |
| `org_contractor_display` | `B15` | - | |
| `org_contractor_full_aosr` | - | `A10` | |
| `org_designer_display` | `B16` | - | current designer/subcontractor ambiguity |
| `org_designer_full_aosr` | - | `A13` | |

## Signatories

| Field | Acts target | AOSR target | Notes |
|---|---|---|---|
| `sign1_desc` | `B20` | - | acts org/role line |
| `sign1_line` | `C20` | - | acts signature line |
| `sign1_full_aosr` | - | `A24` | |
| `sign2_desc` | `B21` | - | |
| `sign2_line` | `C21` | - | |
| `sign2_full_aosr` | - | `A27`, `A30` | contractor + control |
| `sign3_desc` | `B22` | - | optional |
| `sign3_line` | `C22` | - | optional |
| `sign3_full_aosr` | - | `A36` | |
| `sign3_org_name` | - | `A39` or helper text | |
| `tech_desc` | `B23` | - | |
| `tech_line` | `C23` | - | |
| `tech_full_aosr` | - | `A22` | |
| `tech_name` | helper only | `A70`, `A69` | short name |
| `sign1_name` | helper only | `A73`, `A72` | short name |
| `sign2_name` | helper only | `A76`, `A75`, `A80`, `A79` | short name |
| `designer_name` | helper only | `A83`, `A82` | currently optional/blank |
| `sign3_name` | helper only | `A86`, `A85` | short name |

## Pipe / Materials

| Field | Acts target | AOSR target | Notes |
|---|---|---|---|
| `pipe_mark` | `B26` | part of `A49` | |
| `pipe_diameter_display` | `B27` | optional derived | |
| `materials_aosr` | - | `A49` | full combined materials line |
| `subsequent_works` | - | `A59` | default/hardcoded now |

## GNB Params

| Field | Acts target | AOSR target | Notes |
|---|---|---|---|
| `plan_length` | `B31` | - | |
| `profile_length` | `C31` | `B3` | |
| `pipe_count` | `D31` | `C3` | |
| `total_pipe_length` | `E31` | `B4` | formula/derived |
| `drill_diameter` | `F31` | - | |
| `configuration` | `G31` | - | verify whether needed in final workbook |

## Helper Captions

| Field | Acts target | AOSR target | Notes |
|---|---|---|---|
| `aosr_page1_caption` | - | `C18` | page 1 heading |
| `aosr_page2_caption` | - | `C18` | page 2 heading |
| `aosr_object_caption` | - | `A39` | object/address sentence |
| `aosr_work_description` | - | `A43` | long works description |
| `drawing_caption` | - | `G52` / downstream | drawing caption |
