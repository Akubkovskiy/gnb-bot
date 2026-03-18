# Runtime Template Handoff

Final template candidate:

- `C:\Users\kubko\projects\gnb-bot\templates\GNB-master-template-final.xlsx`

## What Is Ready

The workbook is now structurally ready for runtime adoption:

- one workbook
- one canonical `00 DATA` sheet
- acts data layer reads from `00 DATA`
- AOSR data layer reads from `00 DATA`
- AOSR print pages no longer depend on external workbook links
- no `#REF!` remains

This means runtime no longer needs to think in terms of two unrelated Excel templates.

## Important Adoption Rule

Runtime should write values only to the `00 DATA` sheet.

Do not restore direct hardcoded page writes into:

- `14 AOSR - Page 1`
- `15 AOSR - Page 2`
- downstream acts print sheets

Those sheets are now consumers, not write targets.

## Canonical Write Model

Runtime should construct a flat resolved data payload that matches the keys on `00 DATA`.

Primary references:

- `C:\Users\kubko\projects\gnb-bot\docs\MASTER-DATA-FIELD-MAP.md`
- `C:\Users\kubko\projects\gnb-bot\docs\RUNTIME-DEBUG-TO-DATA-MAP.md`

## Required Runtime Changes

### 1. Introduce one unified workbook renderer

Instead of:

- separate acts template write path
- separate AOSR template write path

move to:

- one workbook load
- one `00 DATA` fill pass
- then export required output artifact(s)

### 2. Build a flat DATA payload from `Transition`

Runtime must populate the canonical keys from the final `Transition` object, including:

- identity
- dates
- organizations
- signatories
- pipe/materials
- GNB params
- helper captions/derived strings

### 3. Treat helper keys as renderer-owned derived fields

These keys are not primary intake fields. They should be derived in runtime from the final resolved payload:

- `project_doc_line`
- `aosr_page1_caption`
- `aosr_page2_caption`
- `aosr_object_caption`
- `aosr_work_description`
- `drawing_caption`
- `subsequent_works`

This is important:

- do not rely on fragile Excel-side Russian text formulas for these helpers
- compute them in TypeScript from the same resolved payload used for generation

### 4. Keep routing-only fields separate from print-first fields

`customer` and `object` in intake/debug are routing/navigation fields.

Printed workbook should prefer:

- `title_line`
- `object_name`
- `address`
- normalized organization/signatory fields

Do not let routing aliases leak into print cells by accident.

## Recommended Output Strategy

Preferred:

- one master workbook internally
- two user-facing exports if printing convenience still matters:
  - internal acts file
  - AOSR file

This keeps:

- one data source
- one renderer mapping layer
- no duplication in template logic
- flexibility for print workflow

## Files That Can Be Retired Later

After runtime adoption is complete and validated:

- `templates/Акты ГНБ шаблон v2.xlsx`
- `templates/АОСР шаблон.xlsx`

But do not retire them before:

- new renderer is wired
- stage generation matches expected output
- owner manually validates printed result

## Final Manual Check Still Recommended

Even with the workbook structurally ready, do one manual comparison on stage:

1. `/review_gnb_debug`
2. inspect `resolved_data`
3. fill `00 DATA`
4. generate workbook
5. verify that print sheets match debug payload and expected wording

If that passes, template/runtime adoption can be considered safe.
