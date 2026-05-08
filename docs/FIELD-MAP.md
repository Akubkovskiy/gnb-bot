# Field Map — Internal Acts (Акты ГНБ шаблон v2.xlsx)

Карта полей: resolved_data → Лист1 → печатные листы.

**Принцип:** бот заполняет ТОЛЬКО Лист1 (26 data cells + 2 auto formulas).
Остальные 10 листов подтягивают данные через формулы `=Лист1!XX`.

---

## Секция ИДЕНТИФИКАЦИЯ (строки 2–11)

| Поле resolved_data | Лист1 | Формат | Печатные листы (формулы) |
|---------------------|-------|--------|--------------------------|
| `title_line` | **B3** | строка | Разбивка C3, Герметизация C3, АОСР C3, Надзор C3, Приемка C3, ПП C3, Соосность C3, Сварка C3, Опись C3, Акт освид F6+A9 |
| `object_name` | **B4** | строка | — (не используется печатными листами) |
| `address` | **B5** | строка | Разбивка D15, Герметизация C18, Надзор — (нет), Приемка A18, ПП C18, Соосность C18, Сварка C18, Акт освид A11, Опись C9 |
| `gnb_number` | **B6** | "ЗП № X-Y" | Разбивка J14+F21, Герметизация F17, АОСР A15, Надзор E15, Приемка D17, ПП D17, Соосность F17, Сварка E17, Акт освид F22, Опись C8+B22(concat) |
| `project_number` | **B7** | "ШФ-XXX" | Герметизация H20, Надзор H23, Приемка H20, ПП H20, Соосность H20, Сварка H22, Акт освид F24 |
| `start_date` | **B8** | "«DD» месяца YYYY г." | Герметизация D24, Надзор D27, Приемка D22, ПП D26, Соосность D24, Сварка D26, Акт освид E31 |
| `end_date` | **B9** | "«DD» месяца YYYY г." | Герметизация D26, Надзор D29, Приемка D24, ПП D28, Соосность D26, Сварка D28, Акт освид E33 |
| `executor` | **B10** | "ООО «XXX»" | Герметизация E14, Надзор E14, Приемка E14, ПП E14, Соосность E14, Сварка E14, Акт освид E18 |
| `completion_date` | **B11** | "«DD» месяца YYYY г." | Разбивка C4, Герметизация C4, АОСР C4, Надзор C4, Приемка C4, ПП C4, Соосность C4, Сварка C4, Опись C4, Акт освид G4 |

**Примечание:** `completion_date` = `act_date ?? end_date` (в renderer).

## Секция ОРГАНИЗАЦИИ (строки 13–16)

| Поле resolved_data | Лист1 | Формат | Печатные листы |
|---------------------|-------|--------|----------------|
| `organizations.customer` → display | **B14** | "СВРЭС АО «ОЭК»" (department + short_name) | C1 на 9 листах (все кроме Акт освид) |
| `organizations.contractor.name` | **B15** | "АНО «ОЭК Стройтрест»" | C2 на 9 листах |
| `organizations.designer.name` | **B16** | "ООО «СПЕЦИНЖСТРОЙ»" | Герметизация D20, Надзор D23, Приемка D20, ПП D20, Соосность D20, Сварка D22, Акт освид A26 |

**Примечание:** B14 формируется в renderer как `department + " " + short_name`, fallback на `short_name` или `name`.

## Секция ПОДПИСАНТЫ (строки 18–23)

### B-колонка (описание: организация + должность + ФИО)

| Поле resolved_data | Лист1 | Формат | Печатные листы |
|---------------------|-------|--------|----------------|
| `signatories.sign1_customer` → desc | **B20** | "Представитель АО «ОЭК»" | Герметизация A11, АОСР A11, Надзор A11, Приемка A11, ПП A11, Соосность A11, Сварка A11, Акт освид C14+B42 |
| `signatories.sign2_contractor` → desc | **B21** | "Подрядчик АНО «ОЭК Стройтрест»" | Разбивка A12, Герметизация A12, АОСР A12, Надзор A12, Приемка A12, ПП A12, Соосность A12, Сварка A12, Акт освид C15+B44 |
| `signatories.sign3_optional` → desc | **B22** | (опцион.) или " " | Акт освид C16+B45, Сварка A13 |
| `signatories.tech_supervisor` → desc | **B23** | "Технадзор АО «ОЭК»" | Надзор A17, Акт освид C13+B43 |

### C-колонка (подпись: должность + ФИО)

| Поле resolved_data | Лист1 | Формат | Печатные листы |
|---------------------|-------|--------|----------------|
| `signatories.sign1_customer` → sign | **C20** | "Мастер по ЭРС СВРЭС  Коробков Ю.Н." | Герметизация A35, АОСР A32, Приемка A33, ПП A36, Соосность A35, Сварка A37, Опись A24 |
| `signatories.sign2_contractor` → sign | **C21** | "Начальник участка  Буряк А.М." | Разбивка A28, Герметизация A37, АОСР A34, Надзор A39, Приемка A35, ПП A38, Соосность A37, Сварка A39, Опись A22 |
| `signatories.sign3_optional` → sign | **C22** | (опцион.) или " " | Разбивка A31 |
| `signatories.tech_supervisor` → sign | **C23** | "Главный специалист ОТН  Гайдуков Н.И." | Опись A20 |

**Ключевое:** sign3 (B22/C22) используется только на 3 листах: Акт освид, Сварка, Разбивка.
Если sign3 = " ", эти строки на печатных листах будут визуально пустыми.

## Секция ТРУБА (строки 25–27)

| Поле resolved_data | Лист1 | Формат | Печатные листы |
|---------------------|-------|--------|----------------|
| `pipe.mark` | **B26** | полная марка | Герметизация E22, АОСР D21, ПП E22, Соосность E22, Сварка E24, Опись C13 |
| `pipe.diameter` | **B27** | "d=225" | ПП E24, Опись C15 |

## Секция ПАРАМЕТРЫ ГНБ (строка 31)

| Поле resolved_data | Лист1 | Формат | Печатные листы |
|---------------------|-------|--------|----------------|
| `gnb_number` | **A31** | "ЗП № X-Y" | АОСР D18+D19+D20, Опись A11 |
| `gnb_params.plan_length` | **B31** | число (м) | АОСР F18 |
| `gnb_params.profile_length` | **C31** | число (м) | АОСР H18 |
| `gnb_params.pipe_count` | **D31** | число (шт) | АОСР E19, Опись K15 (=D31*2) |
| — (auto) | **E31** | =C31*D31 | АОСР E20, Опись K13 |
| `gnb_params.drill_diameter` | **F31** | число (мм) | — |
| `gnb_params.configuration` | **G31** | "d=225 2шт" | — |
| — (auto) | **H31** | =E31/13 | Сварка E20 |

---

## Поля, не используемые печатными листами

Эти поля заполняются в Лист1 для полноты, но ни один печатный лист на них не ссылается:

| Лист1 | Поле | Причина |
|-------|------|---------|
| B4 | object_name | Информационное (для человека, не для формул) |
| F31 | drill_diameter | Параметр ГНБ, не участвует в расчётах/актах |
| G31 | configuration | Параметр ГНБ, не участвует в расчётах/актах |

---

## Known Issues (Phase 7.5 findings)

1. ~~B-column desc too verbose~~ **FIXED** (Phase 7.5): `formatSignatoryDesc()` now returns `org_description` as-is for all roles. B-column is a short role label, C-column has position + name.

2. **B4 (object_name) not referenced by print sheets.**
   Written to Лист1 for human readability, but no formula references it. Not a problem, just informational.

## Resolved Issues

1. **Template residual data cleared** (Phase 7.5.1): 25 data cells on Лист1 + 471 cached formula results on print sheets + 3 hardcoded cells on Разбивка converted to formulas. Zero stale data remains.

2. **Разбивка hardcoded→formula fix**: 3 merged cells (A11:E11, A13:E13, A33:H33) were hardcoded text from old project. Converted to `=Лист1!B22` (sign3 desc), `=Лист1!B20` (sign1 desc), `=Лист1!C20` (sign1 sign).

3. **fullCalcOnLoad** added to renderer: Excel recalculates all formulas on open, ensuring print sheets always show current Лист1 data.

---

## Renderer → Cell mapping (код)

Файл: `src/renderer/cell-maps.ts` — source of truth для адресов ячеек.
Файл: `src/renderer/internal-acts.ts` — логика заполнения.
Файл: `src/domain/formatters.ts` — форматирование значений.

### Форматирование

| Трансформация | Функция | Пример |
|---------------|---------|--------|
| DateComponents → строка | `formatDateInternal()` | `{day:10, month:"декабря", year:2025}` → `«10» декабря 2025 г.` |
| Signatory → B-колонка | `formatSignatoryDesc()` | `org_description` (short role label) |
| Signatory → C-колонка | `formatSignatorySign()` | `position  full_name` (двойной пробел) |
| Customer org → display | inline в renderer | `department + " " + short_name` или fallback |
| Пустое значение → ячейка | `writeCell()` | `null/undefined/""` → `" "` (пробел) |
