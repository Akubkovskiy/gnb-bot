# RFC: Draft Intake Mode — GNB Docs Intake Engine

**Status:** Approved by owner (2026-03-16)
**Replaces:** Flow v1 (9-step questionnaire)
**Depends on:** Phase 1-4 domain/store/renderer layer (done)

---

## Главная идея

После `/new_gnb` создаётся draft-карточка перехода.
Пользователь может в любом порядке присылать: текст, PDF, фото, Excel, фрагменты приказов, паспорта труб, сертификаты, схемы, ранее сформированные акты, АОСР, внутренние акты, служебные записки, ручные уточнения.

Бот: classify → extract → map to fields → show user → confirm → generate.

## Статусы draft

- `collecting` — сбор данных
- `awaiting_confirmation` — данные собраны, ждём подтверждения
- `ready` — подтверждён, готов к генерации
- `missing_data` — есть блокирующие пробелы
- `finalized` — акты сгенерированы

## Draft model

### 1. Draft meta
- draft_id, chat_id, created_at, updated_at, status

### 2. Source documents
Для каждого материала:
- source_id, source_type, original_file_name, doc_class
- received_at, parse_status, short_summary

source_type: `manual_text | pdf | photo | excel | prior_act | memory | inferred`

### 3. Extracted fields
Для каждого поля:
- field_name, value, source_id, source_type
- confidence: `high | medium | low`
- confirmed_by_owner: boolean
- conflict_with_existing: boolean
- notes

### 4. Transition target fields

#### Base identity
customer, object, object_name, title_line, gnb_number, gnb_number_short, address, project_number, executor

#### Dates
start_date, end_date, act_date

#### Organizations
organizations.customer, organizations.contractor, organizations.designer

#### Signatories (each with full_name, position, org_description, aosr_full_line, nrs_id, nrs_date, order_type/number/date)
sign1_customer, sign2_contractor, sign3_optional, tech_supervisor

#### Pipe / materials
pipe.mark, pipe.diameter, pipe.diameter_mm, pipe.quality_passport, materials.certificates, materials.additional

#### GNB params
profile_length, plan_length, pipe_count, drill_diameter, configuration

## Классификация документов

doc_class:
- passport_pipe, certificate, executive_scheme
- order, appointment_letter
- prior_internal_act, prior_aosr, summary_excel
- photo_of_doc, free_text_note, unknown

## Правило приоритета источников

1. manual_text от пользователя
2. подтверждённые owner values
3. Excel / prior official act
4. PDF extraction
5. photo OCR
6. memory lookup
7. inferred

Конфликт → не перезаписывать, показать пользователю.

## Confidence policy

- high: явно указано, без двусмысленности, совпадает
- medium: вероятное, но требует проверки (OCR, неоднозначность)
- low: неуверенно, несколько кандидатов

medium/low → всегда сообщать пользователю.

## Команды

- `/new_gnb` — создать draft
- `/review_gnb` — показать сводку (собрано / спорно / не хватает)
- `/cancel` — отменить draft
- Ручные правки: "исправь адрес на..." → manual override
- Финальное подтверждение → generate

## Критически обязательные поля

gnb_number, customer, object, address, start_date, end_date,
sign1_customer, sign2_contractor, tech_supervisor, profile_length,
organizations.customer, organizations.contractor

## Желательные поля

project_number, pipe.quality_passport, plan_length, sign3_optional

## Ответ после каждого intake

```
Принял: <тип/имя>
Распознано: <doc_class>, <1-3 факта>
Добавлено: <поле>: <значение>
Проверить: <сомнительное>
Статус: собрано X/Y, не хватает: <список>
```

## Правило правдивости

Не найдено → "не найдено". 2 кандидата → показать оба. Не уверен → medium/low. Никогда не додумывать номера, даты, НРС, паспорта, шифры, адреса, ФИО.
