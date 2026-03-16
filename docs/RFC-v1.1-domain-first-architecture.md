# RFC v1.1 — GNB Bot Domain-First Architecture

Status: **Approved**
Owner: Alexey
Approved: 2026-03-15
Scope: OEK contour (MVP). MKS/Новая Москва — deferred (awaiting_owner_context).

---

## 1. Цель

Перевести GNB-бота с "Excel-first" на "Domain-first", сохранив текущие шаблоны и рабочий процесс, но сделав систему устойчивой к разным контурам (ОЭК/МКС/Новая Москва), ревизиям и изменению справочников.

## 2. Что считаем фактом (подтверждено)

- Шаблоны существуют и используются:
  - `Акты ГНБ шаблон v2.xlsx` — основной шаблон внутренних актов (11 листов, 163 формулы)
  - `АОСР шаблон.xlsx` — АОСР (3 листа, 36 формул)
  - `Акты ОЭК шаблон.xlsx` — **legacy_candidate**, не удалять, не использовать в MVP
- Golden reference файлы для тестирования:
  - `2 Акты ЗП ГНБ 3-3 v2.xlsx`
  - `5 Акты ЗП ГНБ 5-5.xlsx` / `5 Акты ЗП ГНБ 5-5 v2.xlsx`
- Есть UNIFIED_SCHEMA.md и CELL_MAP.md — актуальные
- Контур ОЭК описан полностью; МКС и Новая Москва — `awaiting_owner_context`
- Строгий документооборот: первичка (PDF/фото) → извлечение → валидация → генерация → архив/трассировка

## 3. Архитектурные решения (утверждены)

### 3.1 Domain-first ядро
- Истина — доменные сущности (Transition, Organization, Signatory, Pipe, Materials), а не ячейки Excel
- Excel — только renderer/view
- Форматирование строк АОСР (aosr_full_line, org strings) — ответственность domain layer, renderer получает готовые строки

### 3.2 Renderer isolation
- CELL_MAP.md — конфигурация рендера
- Два режима рендеринга:
  - **Data cells** (Лист1 обоих файлов) — простой маппинг JSON → cell (39 ячеек)
  - **Hardcoded strings** (АОСР(1) + АОСР(2)) — сборка длинных строк из нескольких полей (25 ячеек)
- Изменения форм шаблонов не ломают доменную модель

### 3.3 Draft lifecycle
- `/new` работает через draft-сессию
- Draft персистируется в `.gnb-memory/drafts/draft-{timestamp}.json`
- **TTL = 7 дней** — по истечении draft удаляется
- `/new` при старте проверяет незавершённые drafts — предлагает продолжить или отбросить
- В `transitions.json` запись попадает только после явного "Утвердить" (status: draft → finalized)

Draft schema:
```jsonc
{
  "id": "draft-20251222-143000",
  "step": 5,                        // текущий шаг из 9
  "customer": "Крафт",
  "object": "Марьино",
  "gnb_number": "ЗП № 5-5",
  "partial_data": { ... },           // всё что собрано на завершённых шагах
  "created_at": "2025-12-22T14:30:00+03:00",
  "expires_at": "2025-12-29T14:30:00+03:00",
  "base_transition_id": "kraft-marjino-5-4"  // если "на основе"
}
```

### 3.4 Справочники по ID + snapshot в ревизии
- В transition хранятся ссылки на справочники (`person_id`, `org_id`) для навигации
- При финализации сохраняется **полный snapshot** данных для исторической достоверности

ID format:
- `person_id`: транслитерация фамилии-инициалов → `gaydukov-ni`, `buryak-am`
- `org_id`: slug → `oek`, `oek-stroytrest`, `specinjstroy`
- `transition_id`: `{customer_slug}-{object_slug}-{gnb_short}` → `kraft-marjino-5-5`

Transition structure:
```jsonc
{
  "id": "kraft-marjino-5-5",
  "status": "finalized",           // draft → finalized
  "finalized_at": "2025-12-22T14:30:00+03:00",
  "data": {
    // ПОЛНЫЙ снимок на момент генерации — для печати
    "signatories": {
      "sign2_contractor": {
        "person_id": "buryak-am",   // ссылка для навигации
        // ... ВСЕ поля как были на момент генерации
      }
    }
  },
  "refs": {
    // Живые ссылки для навигации/поиска (НЕ для генерации)
    "person_ids": ["buryak-am", "gaydukov-ni"],
    "org_ids": ["oek", "oek-stroytrest", "specinjstroy"]
  },
  "source_docs": [],               // пути к первичке
  "generated_files": [],           // пути к сгенерированным файлам
  "revisions": [],                 // история изменений
  "validation_report": {}          // результат проверок
}
```

**Принцип:** `data` = frozen snapshot для печати. `refs` = живые ссылки для навигации. При генерации используется только `data`.

### 3.5 Revision-first /edit
- `/edit` всегда создаёт новую ревизию, исходник не перезаписывается
- Нумерация ревизий: **`изм 1`, `изм 2`, ...** (отраслевой стандарт ПТО)
- Оригинал: `5 Акты ЗП ГНБ 5-5.xlsx` — **неприкосновенен**
- Ревизия 1: `5 Акты ЗП ГНБ 5-5 изм 1.xlsx`
- В JSON: `revisions[].version = "изм 1"`, `revisions[].changes = "адрес изменён"`

### 3.6 Context Escalation Policy
При нехватке данных бот не угадывает:
- `status: awaiting_owner_context`
- 1–5 точных вопросов
- Безопасный fallback, если возможен

## 4. Source-of-truth и приоритет данных

| Приоритет | Источник | Когда применяется |
|-----------|---------|-------------------|
| **1 (высший)** | Ручная правка owner | Безусловный override любого значения |
| **2** | Подтверждённая первичка PDF/фото | Primary extraction source |
| **3** | Подтверждённые данные текущего проекта/перехода | Наследование от предыдущего ЗП |
| **4 (низший)** | Память JSON | Предиктивная подсказка, требует подтверждения |

**Запреты:**
- Нельзя финализировать пакет без обязательных полей
- Нельзя финализировать при неразрешённых конфликтах (два источника с разными данными → спросить owner)
- Нельзя генерировать АОСР без полных реквизитов организаций (ОГРН, ИНН, адрес, тел, СРО)
- Нельзя генерировать акты без НРС у sign2 и tech

## 5. Validation hard-stops (перед генерацией)

| # | Проверка | Уровень |
|---|---------|---------|
| 1 | Все обязательные поля Лист1 заполнены (24/26, без B22/C22 если нет sign3) | **BLOCK** |
| 2 | sign2 имеет НРС + приказ (nrs_id, nrs_date, order_number, order_date) | **BLOCK** |
| 3 | tech имеет НРС + распоряжение | **BLOCK** |
| 4 | end_date >= start_date | **BLOCK** |
| 5 | profile_length > 0 | **BLOCK** |
| 6 | Организации имеют полные реквизиты для АОСР | **BLOCK** |
| 7 | gnb_number парсится в short form | **BLOCK** |
| 8 | sign3 = null → ячейки = `" "` (не пустые) | **WARN** |
| 9 | act_date != end_date → подтверждение owner | **CONFIRM** |
| 10 | welding_end_date заполнена | **WARN** |

## 6. Gate-вопросы (незакрытые)

| Gate | Вопрос | Статус |
|------|--------|--------|
| МКС контур | Формы/реквизиты/подписанты/отличия от ОЭК | `awaiting_owner_context` — deferred post-MVP |
| Новая Москва | Доп. требования/согласования | `awaiting_owner_context` — deferred post-MVP |
| `Акты ОЭК шаблон.xlsx` | Legacy или активный? | **legacy_candidate** — не удалять, не использовать |
| Hard-stop финальный список | Полный перечень проверок | Зафиксирован (раздел 5), расширяется по опыту |

## 7. Definition of Ready для кодинга

Код можно начинать когда:
- [x] Утверждены решения из раздела 3
- [x] MVP scope = OEK only
- [x] Draft TTL = 7 дней
- [x] Golden reference определены (2 Акты ЗП ГНБ 3-3, 5 Акты ЗП ГНБ 5-5)
- [x] Revision naming = "изм N"
- [x] Source priority = owner > PDF > project > memory
- [x] Snapshot + refs model утверждена
- [ ] Шаблоны верифицированы на VPS (P0.2)
- [ ] Excel generation mechanism выбран (P0.3)

## 8. Следующий шаг

Implementation plan (без кода):
- Модули и интерфейсы
- Тестовая стратегия
- P0/P1/P2 backlog с зависимостями

---

## Changelog

- **v1.0** (2026-03-15): Initial RFC proposed
- **v1.1** (2026-03-15): Approved with 4 amendments:
  1. Revision naming: `изм N` (not `v2/v3`)
  2. Source priority: owner override > PDF > project > memory
  3. Snapshot + refs dual model for transitions
  4. Draft persistence with 7-day TTL
  Additional decisions: MVP = OEK only, legacy_candidate for old template, golden references identified
