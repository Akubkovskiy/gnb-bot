# GNB Bot — Implementation Plan

RFC: [RFC-v1.1-domain-first-architecture.md](RFC-v1.1-domain-first-architecture.md)
Status: **Approved for planning** (no code until gates closed)
Date: 2026-03-15

---

## 0. Текущее состояние кода (baseline)

### Что есть и работает

| Модуль | Файл | Статус | Комментарий |
|--------|------|--------|------------|
| Bot entry | `src/index.ts` | ✅ Работает | Grammy + auth + handlers |
| Config | `src/config.ts` | ✅ Работает | Env vars, пути |
| Auth middleware | `src/telegram/middleware.ts` | ✅ Работает | Фильтр по allowedUserIds |
| Handlers | `src/telegram/handlers.ts` | ✅ Работает | /start, /help, /new_gnb (flow engine), /cancel, text→flow routing, Claude fallback |
| Claude CLI | `src/claude.ts` | ✅ Работает | askClaude(), ocrDocument(), findClaudePath() |
| Memory init | `src/memory/init.ts` | ⚠️ Неполно | Создаёт 4 JSON: projects, people, organizations, gnb-transitions. **Нет** customers.json, preferences.json |
| Memory reader | `src/memory/reader.ts` | ✅ Работает | buildMemoryContext() → markdown для промпта |
| Excel read | `src/documents/excel.ts` | ✅ Работает | readSheet1() — парсинг Лист1 |
| Excel fill | `src/documents/fill-act.ts` | ⚠️ Частично | Только внутр. акты (26 ячеек Лист1). **Нет АОСР**. Нет hardcoded cells |
| Path utils | `src/utils/paths.ts` | ✅ Работает | getWorkRoot, getMemoryDir, getProjectDir, getTempDir |
| Logger | `src/logger.ts` | ✅ Работает | Pino |
| CLAUDE.md | 587 строк | ✅ Полный | Системный промпт со всеми правилами |
| Skills (md) | `skills/*.md` | ✅ 4 файла | new-act, add-specialist, fix-remarks, search-memory |

### Чего нет (нужно создать)

| Модуль | Назначение | Приоритет |
|--------|-----------|-----------|
| Domain types | TypeScript интерфейсы для Transition, Signatory, Organization, Pipe, etc. | P0 |
| Domain formatters | formatDateInternal(), formatOrgAosr(), formatSignatoryAosr(), etc. | P0 |
| AOSR renderer | Заполнение АОСР шаблона (Лист1 + АОСР(1) + АОСР(2) hardcoded) | P0 |
| Validator | validate-completeness: hard-stops, warnings, confirms | P0 |
| Draft manager | CRUD для draft-сессий в .gnb-memory/drafts/ | P0 |
| /new flow engine | 9-шаговый conversation flow с session state | P0 |
| Transition store | CRUD для transitions.json с snapshot/refs model | P0 |
| People store | CRUD для people.json с person_id | P1 |
| Customer store | CRUD для customers.json | P1 |
| Revision manager | /edit → изм N, diff, re-generate | P1 |
| Doc index | doc-index.json для трассируемости source_docs | P1 |
| Preferences store | preferences.json для prediction engine | P2 |

### Зависимости (package.json)

Уже есть:
- `exceljs` ^4.4.0 — основной Excel engine (**Gate 2 закрыт: используем ExcelJS**)
- `grammy` ^1.35.0 — Telegram
- `xlsx` ^0.18.5 — дополнительный парсер (можно убрать, ExcelJS достаточно)
- `pino` — логи
- `dotenv` — env

Нужно добавить:
- (ничего) — ExcelJS покрывает чтение+запись, Grammy покрывает Telegram

---

## 1. Модульная архитектура (target)

```
src/
├── index.ts                          ← entry point (без изменений)
├── config.ts                         ← env config (без изменений)
├── logger.ts                         ← pino (без изменений)
├── claude.ts                         ← Claude CLI wrapper (без изменений)
│
├── domain/                           ← NEW: доменный слой
│   ├── types.ts                      ← Transition, Organization, Signatory, Pipe, etc.
│   ├── formatters.ts                 ← formatDateInternal, formatOrgAosr, formatSignatoryAosr
│   ├── ids.ts                        ← generatePersonId, generateOrgId, generateTransitionId
│   └── validators.ts                 ← validateTransition → { blockers, warnings, confirms }
│
├── store/                            ← NEW: persistence layer
│   ├── transitions.ts                ← TransitionStore: create, finalize, list, get, addRevision
│   ├── people.ts                     ← PeopleStore: add, update, findByName, getById
│   ├── customers.ts                  ← CustomerStore: add, getObjects, updateLastGnb
│   ├── drafts.ts                     ← DraftStore: create, update, resume, expire, list
│   └── preferences.ts               ← PreferencesStore: get, update
│
├── renderer/                         ← NEW: Excel output layer
│   ├── internal-acts.ts              ← fillInternalActs(transition) → xlsx path
│   ├── aosr.ts                       ← fillAosr(transition) → xlsx path
│   └── cell-maps.ts                  ← CELL_MAP constants (from CELL_MAP.md)
│
├── flow/                             ← NEW: conversation flow engine
│   ├── new-flow.ts                   ← 9-step /new flow state machine
│   ├── edit-flow.ts                  ← /edit flow (find → diff → confirm → revision)
│   └── flow-types.ts                 ← FlowState, FlowStep, FlowResult
│
├── telegram/                         ← EXISTING: расширяем
│   ├── handlers.ts                   ← REFACTOR: wire /new → new-flow, /edit → edit-flow
│   ├── keyboards.ts                  ← inline buttons (без изменений)
│   └── middleware.ts                 ← auth (без изменений)
│
├── documents/                        ← EXISTING: оставляем
│   ├── excel.ts                      ← readSheet1 (без изменений)
│   └── fill-act.ts                   ← DEPRECATED → renderer/internal-acts.ts
│
├── memory/                           ← EXISTING: расширяем
│   ├── init.ts                       ← UPDATE: добавить customers.json, preferences.json, drafts/
│   └── reader.ts                     ← UPDATE: читать новые stores
│
└── utils/
    ├── paths.ts                      ← EXTEND: getDraftsDir, getTransitionDir
    └── dates.ts                      ← date parsing (если есть — расширить)
```

---

## 2. Интерфейсы (TypeScript contracts)

### 2.1 domain/types.ts

```typescript
// === Даты ===
interface DateComponents {
  day: number;
  month: string;        // родительный падеж: "октября"
  year: number;
}

// === Организация ===
interface Organization {
  id: string;            // "oek", "oek-stroytrest", "specinjstroy"
  name: string;          // полное юр. название
  short_name?: string;   // АО «ОЭК»
  department?: string;   // СВРЭС (только для заказчика)
  ogrn: string;
  inn: string;
  legal_address: string;
  phone: string;
  sro_name: string;
  sro_ogrn?: string;     // только для заказчика
  sro_inn?: string;      // только для заказчика
  sro_number?: string;   // СРО-С-NNN-DDMMYYYY
  sro_date?: string;     // DD.MM.YYYY
}

// === Подписант ===
type SignatoryRole = "sign1" | "sign2" | "sign3" | "tech";

interface Signatory {
  person_id: string;       // "gaydukov-ni"
  role: SignatoryRole;
  org_description: string; // "Представитель АО «ОЭК»"
  position: string;        // "Главный специалист ОТН"
  full_name: string;       // "Гайдуков Н.И."
  nrs_id?: string;         // "C-71-259039" (sign2, tech)
  nrs_date?: string;       // "23.09.2022"
  order_type?: string;     // "распоряжение" | "приказ"
  order_number?: string;   // "01/3349-р"
  order_date?: string;     // "14.10.2024"
  aosr_full_line: string;  // полная строка для АОСР
}

// === Труба и материалы ===
interface Pipe {
  mark: string;            // "Труба ЭЛЕКТРОПАЙП 225/170-N 1250 F2 SDR 13,6"
  diameter: string;        // "d=225"
  diameter_mm: number;     // 225
  quality_passport?: string;  // "№11086 от 08.09.2025"
  conformity_cert?: string;   // "№РОСС RU..."
}

interface Materials {
  ukpt?: { passport?: string; cert_letter?: string };
  plugs?: { cert_letter?: string };
  cord?: { cert_letter?: string };
}

// === Параметры ГНБ ===
interface GnbParams {
  profile_length: number;     // обязательно
  plan_length?: number;
  pipe_count: number;         // обязательно, default 2
  drill_diameter?: number;
  configuration?: string;
}

// === Transition (основная сущность) ===
type TransitionStatus = "draft" | "finalized";

interface Transition {
  id: string;                  // "kraft-marjino-5-5"
  status: TransitionStatus;
  created_at: string;          // ISO
  finalized_at?: string;       // ISO

  // Идентификация
  customer: string;            // "Крафт"
  object: string;              // "Марьино"
  gnb_number: string;          // "ЗП № 5-5"
  gnb_number_short: string;    // "5-5"
  title_line: string;
  object_name: string;
  address: string;
  project_number: string;
  executor: string;

  // Даты
  start_date: DateComponents;
  end_date: DateComponents;
  act_date?: DateComponents;   // null → end_date
  welding_end_date?: string;

  // Связи (для навигации)
  refs: {
    person_ids: string[];
    org_ids: string[];
  };

  // Данные (snapshot для генерации/печати)
  organizations: {
    customer: Organization;
    contractor: Organization;
    designer: Organization;
  };
  signatories: {
    sign1_customer: Signatory;
    sign2_contractor: Signatory;
    sign3_optional?: Signatory;
    tech_supervisor: Signatory;
  };
  pipe: Pipe;
  materials?: Materials;
  gnb_params: GnbParams;
  permits?: { sro_number?: string; sro_date?: string };
  regulatory?: { ministerial_order?: string; form_aosr1?: string; form_aosr2?: string };

  // Трассируемость
  source_docs: string[];       // пути к первичке
  generated_files: string[];   // пути к сгенерированным файлам
  validation_report?: ValidationReport;

  // Ревизии
  revisions: Revision[];
}

interface Revision {
  version: string;             // "изм 1", "изм 2"
  date: string;                // ISO
  changes: string;             // описание что изменилось
  diff: Record<string, { old: unknown; new: unknown }>;
  generated_files: string[];
}

// === Валидация ===
type ValidationLevel = "BLOCK" | "WARN" | "CONFIRM";

interface ValidationIssue {
  level: ValidationLevel;
  field: string;
  message: string;
}

interface ValidationReport {
  valid: boolean;              // true если нет BLOCK
  issues: ValidationIssue[];
  checked_at: string;          // ISO
}
```

### 2.2 domain/formatters.ts (сигнатуры)

```typescript
// Дата для внутр. актов: «6» октября 2025 г.
function formatDateInternal(d: DateComponents): string;

// Подписант для B-колонки: "Представитель АО «ОЭК», Мастер по ЭРС СВРЭС, Акимов Ю.О."
function formatSignatoryDesc(s: Signatory): string;

// Подписант для C-колонки: "Мастер по ЭРС СВРЭС __________ Акимов Ю.О."
function formatSignatorySign(s: Signatory): string;

// Организация для АОСР(1): полная строка с ОГРН/ИНН/адресом/СРО
function formatOrgAosr(org: Organization, role: "customer" | "contractor" | "designer"): string;

// Материалы для АОСР(2).A49: длинная строка с трубой + паспортами + сертификатами
function formatMaterialsAosr(pipe: Pipe, materials?: Materials): string;

// Проектная документация для АОСР(1).A45
function formatProjectDocAosr(designer: Organization, projectNumber: string): string;
```

### 2.3 store/ interfaces

```typescript
// Все stores работают с JSON-файлами через readJsonSafe/writeJsonSafe

interface TransitionStore {
  list(): Transition[];
  get(id: string): Transition | null;
  getByGnbNumber(gnbShort: string): Transition | null;
  findByCustomerObject(customer: string, object: string): Transition[];
  create(data: Transition): void;
  finalize(id: string): void;           // draft → finalized, set finalized_at
  addRevision(id: string, rev: Revision): void;
  getLastForObject(customer: string, object: string): Transition | null;
}

interface DraftStore {
  list(): Draft[];
  listActive(): Draft[];                // не просроченные
  get(id: string): Draft | null;
  create(step: number, partialData: Partial<Transition>): Draft;
  update(id: string, step: number, partialData: Partial<Transition>): void;
  delete(id: string): void;
  expireOld(): number;                   // удалить drafts старше 7 дней, вернуть кол-во
}

interface PeopleStore {
  list(): Person[];
  get(id: string): Person | null;
  findByName(surname: string): Person[];  // fuzzy по фамилии
  add(person: Person): void;
  update(id: string, updates: Partial<Person>): void;
}

interface CustomerStore {
  list(): Customer[];
  get(slug: string): Customer | null;
  getObjects(slug: string): ObjectEntry[];
  add(customer: Customer): void;
  updateLastGnb(customerSlug: string, objectSlug: string, gnbNumber: string): void;
}
```

### 2.4 renderer/ interfaces

```typescript
interface RenderResult {
  filePath: string;         // путь к сгенерированному xlsx
  cellsFilled: number;      // сколько ячеек заполнено
  warnings: string[];       // предупреждения (пустые опциональные поля)
}

// renderer/internal-acts.ts
function renderInternalActs(transition: Transition, outputDir: string): Promise<RenderResult>;

// renderer/aosr.ts
function renderAosr(transition: Transition, outputDir: string): Promise<RenderResult>;

// renderer/cell-maps.ts — константы
const INTERNAL_ACTS_CELL_MAP: Record<string, string>;  // 26 data cells
const AOSR_SHEET1_CELL_MAP: Record<string, string>;    // 13 data cells
const AOSR1_HARDCODED: { cell: string; formatter: (t: Transition) => string }[];  // 16 cells
const AOSR2_HARDCODED: { cell: string; formatter: (t: Transition) => string }[];  // 9 cells
```

### 2.5 flow/ interfaces

```typescript
type FlowStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

interface FlowState {
  draftId: string;
  step: FlowStep;
  chatId: number;
  data: Partial<Transition>;
  baseTransitionId?: string;  // "на основе ЗП X"
  awaitingConfirm?: boolean;  // ждём да/нет на шаге 8
}

interface FlowEngine {
  // Начать новый /new flow или продолжить draft
  start(chatId: number): Promise<string>;           // возвращает первое сообщение бота

  // Обработать ответ пользователя на текущем шаге
  handleInput(chatId: number, text: string): Promise<FlowResponse>;

  // Обработать файл от пользователя (PDF/фото)
  handleFile(chatId: number, filePath: string, fileType: string): Promise<FlowResponse>;
}

interface FlowResponse {
  message: string;            // текст для отправки пользователю
  files?: string[];           // файлы для отправки (шаг 9)
  done?: boolean;             // flow завершён
  error?: string;             // ошибка
}
```

---

## 3. Тестовая стратегия

### 3.1 Golden reference тестирование

Используем заполненные файлы из `templates/` как эталон:
- `2 Акты ЗП ГНБ 3-3 v2.xlsx` — transition ЗП 3-3
- `5 Акты ЗП ГНБ 5-5.xlsx` — transition ЗП 5-5

**Методика:**
1. Извлечь данные из golden reference → создать JSON fixture
2. Прогнать JSON через renderer → получить xlsx
3. Сравнить ячейки rendered vs golden → должно быть 0 расхождений

### 3.2 Уровни тестирования

| Уровень | Что тестируем | Инструмент | Кол-во тестов (оценка) |
|---------|--------------|-----------|----------------------|
| **Unit: domain** | formatters, validators, id generators | Bun test / vitest | ~30 |
| **Unit: store** | CRUD операции, draft TTL, revision numbering | Bun test + tmp dir | ~25 |
| **Unit: renderer** | Cell mapping, value formatting, formula preservation | ExcelJS assertions | ~20 |
| **Integration: golden** | Full JSON → render → compare with golden reference | ExcelJS cell-by-cell compare | ~10 |
| **Integration: flow** | 9-step conversation simulation | Mock Grammy context | ~15 |
| **E2E** | /new в Telegram → файлы в папке → transitions.json обновлён | Manual + screenshot | ~5 |

**Итого: ~105 тестов**

### 3.3 Критерии приёмки (test exit criteria)

1. **Golden reference match** — generated xlsx совпадает с эталоном по всем заполненным ячейкам
2. **Formula preservation** — формулы на листах 2-11 (внутр. акты) и АОСР(2) не повреждены после записи ExcelJS
3. **Validation blocks** — при отсутствии обязательных полей генерация не запускается
4. **Draft persistence** — прерванный на шаге 5 /new flow восстанавливается после перезапуска
5. **Revision integrity** — оригинал файла не изменён после /edit
6. **Snapshot correctness** — finalized transition содержит все данные на момент генерации

### 3.4 Тестовые данные

Нужно создать 3 JSON fixture:

| Fixture | Источник | Назначение |
|---------|---------|-----------|
| `fixtures/transition-3-3.json` | Извлечь из `2 Акты ЗП ГНБ 3-3 v2.xlsx` | Golden reference test #1 |
| `fixtures/transition-5-5.json` | Извлечь из `5 Акты ЗП ГНБ 5-5.xlsx` | Golden reference test #2 |
| `fixtures/transition-minimal.json` | Минимальный valid transition | Validator edge cases |

---

## 4. Implementation Backlog

### Phase 0: Foundation (prerequisite — перед кодом)

| # | Задача | Вход | Выход | DoD | Блокер |
|---|--------|------|-------|-----|--------|
| 0.1 | Верифицировать шаблоны на VPS | SSH → fin | Оба .xlsx открываются, формулы работают | Скриншот проверки | — |
| 0.2 | Извлечь golden reference fixtures | 2 заполненных xlsx | 2 JSON fixtures в `tests/fixtures/` | JSON соответствует UNIFIED_SCHEMA | 0.1 |
| 0.3 | Настроить test runner | package.json | `bun test` / `vitest` работает | 1 dummy test проходит | — |

### Phase 1: Domain Layer (P0 — ядро)

| # | Задача | Файл(ы) | DoD | Тесты | Зависимость |
|---|--------|---------|-----|-------|-------------|
| 1.1 | TypeScript types | `src/domain/types.ts` | Все интерфейсы из раздела 2.1 | Компиляция без ошибок | — |
| 1.2 | ID generators | `src/domain/ids.ts` | generatePersonId, generateOrgId, generateTransitionId | 8 unit tests (edge cases: кириллица, дефисы, коллизии) | 1.1 |
| 1.3 | Date formatters | `src/domain/formatters.ts` | formatDateInternal, parseDate | 6 tests (все форматы ввода из CLAUDE.md) | 1.1 |
| 1.4 | Signatory formatters | `src/domain/formatters.ts` | formatSignatoryDesc, formatSignatorySign, aosr_full_line assembly | 8 tests (все 4 роли × 2 формата) | 1.1 |
| 1.5 | Organization formatters | `src/domain/formatters.ts` | formatOrgAosr для 3 ролей | 6 tests (customer/contractor/designer × with/without optional fields) | 1.1 |
| 1.6 | Materials formatter | `src/domain/formatters.ts` | formatMaterialsAosr → АОСР(2).A49 string | 3 tests (full/partial/minimal materials) | 1.1 |
| 1.7 | Validator | `src/domain/validators.ts` | validateTransition → ValidationReport | 12 tests (10 hard-stops × pass/fail + 2 confirm scenarios) | 1.1 |

**Phase 1 total: 43 tests**

### Phase 2: Store Layer (P0 — persistence)

| # | Задача | Файл(ы) | DoD | Тесты | Зависимость |
|---|--------|---------|-----|-------|-------------|
| 2.1 | TransitionStore | `src/store/transitions.ts` | CRUD + finalize + addRevision + snapshot | 8 tests | 1.1 |
| 2.2 | DraftStore | `src/store/drafts.ts` | CRUD + expireOld (7-day TTL) + listActive | 7 tests (incl. expiry edge case) | 1.1 |
| 2.3 | PeopleStore | `src/store/people.ts` | CRUD + findByName (fuzzy) + person_id | 5 tests | 1.2 |
| 2.4 | CustomerStore | `src/store/customers.ts` | CRUD + getObjects + updateLastGnb | 4 tests | 1.2 |
| 2.5 | Memory init update | `src/memory/init.ts` | Добавить customers.json, preferences.json, drafts/ | 1 test (idempotent init) | 2.2, 2.4 |

**Phase 2 total: 25 tests**

### Phase 3: Renderer Layer (P0 — Excel output)

| # | Задача | Файл(ы) | DoD | Тесты | Зависимость |
|---|--------|---------|-----|-------|-------------|
| 3.1 | Cell map constants | `src/renderer/cell-maps.ts` | Все 64 ячейки из UNIFIED_SCHEMA + CELL_MAP | Compile-time check | — |
| 3.2 | Internal acts renderer | `src/renderer/internal-acts.ts` | Transition → заполненный Акты ГНБ шаблон v2.xlsx (26 data cells + A31 auto) | 5 tests: golden match, formula preservation, empty optional, sign3 absent, numbers as numbers | 1.3, 1.4, 3.1 |
| 3.3 | АОСР renderer | `src/renderer/aosr.ts` | Transition → заполненный АОСР шаблон (Лист1: 13 cells, АОСР(1): 16 hardcoded, АОСР(2): 9 hardcoded) | 7 tests: golden match, all hardcoded strings, formula preservation (АОСР(2)→АОСР(1) refs), sign3 absent | 1.5, 1.6, 3.1 |
| 3.4 | Golden reference integration | `tests/golden/` | Render from fixtures → compare cell-by-cell with golden xlsx | 4 tests (2 transitions × 2 templates) | 0.2, 3.2, 3.3 |
| 3.5 | Deprecate fill-act.ts | `src/documents/fill-act.ts` | Пометить deprecated, оставить для обратной совместимости | — | 3.2 |

**Phase 3 total: 16 tests**

### Phase 4: Flow Engine (P0 — /new_gnb conversation) ✅ DONE (2026-03-16)

**Status:** Completed. 30 tests passed. No file generation (deferred to 4.8 — depends on Phase 0 templates).

| # | Задача | Файл(ы) | Статус | Тесты |
|---|--------|---------|--------|-------|
| 4.1 | Flow types | `src/flow/flow-types.ts` | ✅ | Compile |
| 4.2 | Flow engine core | `src/flow/new-flow.ts` | ✅ | 14 step tests |
| 4.3 | Step 1-3: identification | `src/flow/new-flow.ts` | ✅ | customer known/new, object num/name, gnb_number w/ and w/o prior |
| 4.4 | Step 4: base inheritance | `src/flow/new-flow.ts` | ✅ | inherit да, scratch с нуля, skip when no prior |
| 4.5 | Step 5: signatories | `src/flow/new-flow.ts` | ✅ | те же, replacement, not-found |
| 4.6 | Step 6-7: dates + params | `src/flow/new-flow.ts` | ✅ | date parsing, date error, params parsing, missing profile |
| 4.7 | Step 8: summary + confirm | `src/flow/new-flow.ts` | ✅ | shows summary, confirm да → finalize, нет → keep |
| 4.8 | Flow-to-renderer integration | `handlers.ts`, `new-flow.ts`, `flow-types.ts` | ✅ | 5 integration tests (finalize→render internal acts, finalize→render АОСР, both files in same dir, transition persisted, render failure doesn't lose transition) |
| 4.9 | Draft resume | `src/flow/new-flow.ts` | ✅ | resume да, discard нет + fresh start |
| 4.10 | Wire handlers | `src/telegram/handlers.ts` | ✅ | /new_gnb, /cancel, text→flow routing |

**Phase 4 actual: 35 tests (30 flow + 5 integration)**

**Key decisions:**
- `/new_gnb` (not `/new`) — `/new` is reserved as system reset command
- `step=0` for resume_prompt state — explicit state instead of heuristic detection
- Organizations step (6) auto-skipped when inherited from previous transition
- `based_on_previous` step (4) skipped when no prior transition exists
- Finalization = draft→transition handoff only, no XLSX rendering

**Renderer integration (Phase 4.8, 2026-03-16):**
`finalizeDraft()` returns `{ transition, warnings }`. `FlowResponse` now carries `transition` field when `done: true`. Handler calls `renderInternalActs(transition, outputDir)` + `renderAosr(transition, outputDir)` → sends `.xlsx` files via Telegram. Render failure doesn't lose transition (already persisted). 5 integration tests verify the full pipeline.

### Phase 5: /edit + Revision (P1)

| # | Задача | Файл(ы) | DoD | Тесты | Зависимость |
|---|--------|---------|-----|-------|-------------|
| 5.1 | Edit flow | `src/flow/edit-flow.ts` | /edit → select transition → input changes → show diff → confirm → re-render | 5 tests | 2.1, 3.2, 3.3 |
| 5.2 | Revision numbering | `src/store/transitions.ts` | Auto-increment "изм N", keep original | 3 tests (first, second, concurrent) | 2.1 |
| 5.3 | File rename | `src/flow/edit-flow.ts` | Original untouched, new file = `{name} изм {N}.xlsx` | 2 tests | 5.1 |
| 5.4 | Wire /edit handler | `src/telegram/handlers.ts` | /edit command wired | 1 test | 5.1 |

**Phase 5 total: 11 tests**

### Phase 6: Document Ingestion (P1)

| # | Задача | Файл(ы) | DoD | Тесты | Зависимость |
|---|--------|---------|-----|-------|-------------|
| 6.1 | Doc classifier | `src/documents/classifier.ts` | PDF/photo → type detection (5 types + unknown) | 6 tests (one per type + unknown) | — |
| 6.2 | Passport extractor | `src/documents/extractors.ts` | PDF → pipe.mark, diameter, passport_number | 2 tests (real PDF if available) | 6.1 |
| 6.3 | Order extractor | `src/documents/extractors.ts` | PDF → full_name, nrs_id, order_number, etc. | 2 tests | 6.1 |
| 6.4 | Doc index store | `src/store/doc-index.ts` | Track all ingested docs with type, path, date | 3 tests | — |
| 6.5 | Wire file handlers | `src/telegram/handlers.ts` | Incoming PDF/photo → classify → extract → confirm → store | 2 tests | 6.1-6.4 |

**Phase 6 total: 15 tests**

### Phase 7: Quality of Life (P2)

| # | Задача | DoD | Зависимость |
|---|--------|-----|-------------|
| 7.1 | Preferences store | Read/write preferences.json, prediction defaults | Phase 2 |
| 7.2 | Prediction engine | Auto-suggest customer, signatories, address from history | Phase 4 |
| 7.3 | /people command | List/search specialists | Phase 2 |
| 7.4 | /search command | Search transitions by customer/object/number | Phase 2 |
| 7.5 | Session state in Grammy | conversations plugin for multi-step flows | Phase 4 |

---

## 5. Execution Order (критический путь)

```
Phase 0 (Foundation)
  │
  ├──→ 0.1 Verify templates on VPS ──→ 0.2 Extract golden fixtures
  │                                          │
  └──→ 0.3 Setup test runner ───────────────┘
                                             │
Phase 1 (Domain) ←───────────────────────────┘
  │
  ├──→ 1.1 Types ──→ 1.2 IDs
  │              ──→ 1.3 Date formatters
  │              ──→ 1.4 Signatory formatters
  │              ──→ 1.5 Org formatters
  │              ──→ 1.6 Materials formatter
  │              ──→ 1.7 Validator
  │
Phase 2 (Store) ←── 1.1, 1.2
  │
  ├──→ 2.1 TransitionStore
  ├──→ 2.2 DraftStore
  ├──→ 2.3 PeopleStore
  ├──→ 2.4 CustomerStore
  └──→ 2.5 Memory init update
  │
Phase 3 (Renderer) ←── 1.3-1.6, 0.2
  │
  ├──→ 3.1 Cell maps ──→ 3.2 Internal acts ──→ 3.4 Golden tests
  │                  ──→ 3.3 АОСР ────────────┘
  │
Phase 4 (Flow) ←── Phase 2, Phase 3, 1.7
  │
  ├──→ 4.1-4.10 (sequential: steps build on each other)
  │
Phase 5 (/edit) ←── Phase 4
  │
Phase 6 (Docs) ←── Phase 2 (can run parallel with Phase 5)
  │
Phase 7 (QoL) ←── Phase 4
```

**Минимальный MVP (Phases 0-4):** /new работает E2E, генерирует оба Excel файла, сохраняет в правильную папку, обновляет memory.

**Полный P1 (+ Phases 5-6):** /edit с ревизиями, приём PDF-документов.

### Phase 7.5: Template & Generation Stabilization (P0)

Phase 7 validation gate пройден (2026-03-21), но generation layer не считается product-ready.
Шаблоны работают, файлы создаются, но template contract не стабилизирован,
покрытие сценариев однобокое, шаблон актов не доведён до чистого продуктового состояния.

**Правило:** storage/cloud (Phase 8) заблокирован до закрытия Phase 7.5.

| # | Задача | DoD | Зависимость |
|---|--------|-----|-------------|
| 7.5.1 | Template cleanup — общие акты | Шаблон актов в чистом human-readable состоянии: без residual data, с понятными подписями ячеек, упрощённый входной лист. Логика "входной лист → печатные листы" сохранена | Phase 7 |
| 7.5.2 | Signatory scenario: 2 подписанта | Тест + stage smoke check: 2 подписанта (без sign3). Корректные пробелы в B22/C22, корректная нумерация, АОСР sign3 cells = пробел | 7.5.1 |
| 7.5.3 | Signatory scenario: 3 подписанта | Тест + stage smoke check: 3 подписанта (с sign3). Закрепить как golden reference. Текущий fixture ЗП 5-5 как baseline | 7.5.1 |
| 7.5.4 | Organization field coverage | Проверить customer_org (department + short_name vs name), contractor/designer SRO fields в АОСР. Edge cases: пустой department, пустой short_name | 7.5.1 |
| 7.5.5 | Pipe & GNB params edge cases | Проверить: пустой plan_length, пустой drill_diameter, пустой configuration. Убедиться что renderer не ломается и пишет пробелы | 7.5.1 |
| 7.5.6 | Mapping stabilization | cell-maps.ts = source of truth. UNIFIED_SCHEMA.md согласован с cell-maps.ts. Задокументировать какие поля используются, какие игнорируются | 7.5.1 |
| 7.5.7 | Template architecture decision | Отдельное решение после 7.5.1: остаёмся на split templates или переходим на master template. Решение фиксируется в TEMPLATE-ROADMAP.md. Не принимать заранее | 7.5.1–7.5.6 |

**Явно не входит в Phase 7.5:**
- АОСР доработки (designer_representative, welding_end_date) — отдельный scope, не блокирует акты
- Шаблоны для другого заказчика (не ОЭК)
- Новая Москва, МКС — другой layout актов
- Другое количество / структура подписантов (>4)
- Separate construction control representative

**Acceptance criteria:**
- [ ] Template файл актов чистый (без residual data, с понятными подписями ячеек)
- [ ] Тесты покрывают минимум 2 сценария подписантов (2 и 3)
- [ ] Stage generation validation на 2 сценариях: реальный smoke check generated Excel output
- [ ] Mapping задокументирован и стабилизирован (cell-maps.ts + UNIFIED_SCHEMA.md согласованы)
- [ ] АОСР не блокирует работу по актам — отдельный scope
- [ ] Template architecture decision принято и зафиксировано (split vs master)

---

### Post-7.5 Roadmap

| Phase | Фокус | Зависимость |
|-------|-------|-------------|
| 8 | Storage & Cloud placement (Google Drive) | Phase 7.5 |
| 9 | Print-pack PDF assembly | Phase 8 |
| 10 | Documentation registry (OEK) | Phase 8 |
| 11 | Drilling protocol | Separate track |
| Future | Новая Москва, МКС, другие заказчики, другой layout | Deferred |

---

## 6. Риски и митигация

| Риск | Вероятность | Импакт | Митигация |
|------|------------|--------|-----------|
| ExcelJS ломает формулы при записи | Средняя | **Критично** | Phase 3.4: golden reference test ловит это на раннем этапе. Fallback: `calcProperties: { fullCalcOnLoad: true }` в workbook options |
| Grammy conversation state lost on restart | Высокая | Средне | Phase 4.9: draft persistence в JSON, не в RAM |
| Claude CLI timeout на шаге 5 (подписанты lookup) | Средняя | Средне | PeopleStore.findByName() — TypeScript lookup, не Claude CLI |
| АОСР(2) формулы ссылаются на АОСР(1) — порядок листов критичен | Низкая | Критично | Тест 3.3: проверить что формулы АОСР(2) корректны после записи |
| Большие файлы > 50MB для Telegram | Низкая | Средне | Проверить размер golden reference файлов |

---

## 7. Что НЕ входит в план

- МКС контур (deferred, awaiting_owner_context)
- Новая Москва (deferred)
- Scheduler для GNB (не нужен — бот реактивный)
- Decision-flow интеграция (GNB изолирован, useSharedMemory=false)
- Multi-user поддержка
- Batch generation (/batch 5-5,5-6,5-7)
- Print-ready package компоновка

---

## 8. Следующий шаг

После утверждения этого плана:
1. Закрыть Phase 0 (verify templates, extract fixtures, setup tests)
2. Начать Phase 1 (domain types + formatters + validator)
3. Итеративно: Phase 2 → 3 → 4

Код пишем только после Phase 0 полностью закрыт.
