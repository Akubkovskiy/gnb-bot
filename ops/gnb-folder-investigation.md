# GNB/ Archiver Hypothesis Check

**Date:** 2026-05-07
**Phase:** 0.5b
**Verdict:** NOT a duplicate archive. GNB/ is an empty taxonomy skeleton — 0 files, 198 folders.

---

## Finding

The plan hypothesized that `GNB/` was the output of a previous archiver that copied/moved
files from A/B categories. **This is wrong.**

`create-gnb-structure.ps1` created a folder structure **without moving any files**.
GNB/ contains only empty directories with descriptive names.

```
Total files:   0
Total entries: 198 (all directories)
```

**Impact on Phase D:** Batches 13-14 ("merge without duplicates") are irrelevant.
Instead, the GNB/ skeleton is a **pre-done taxonomy map** — use it as input for
`scripts/taxonomy.yaml` directly.

---

## Phase D Batch Adjustments (vs plan v6)

| Plan batch | Was | Now |
|------------|-----|-----|
| 13 `GNB/_Реестр/` + `GNB/_Приказы/` | diff vs batch 11, merge | SKIP — empty dirs, nothing to ingest |
| 14 `GNB/МКС/` / `GNB/Новая Москва/` / `GNB/ОЭК/` | diff vs batches 1-9, merge | SKIP — empty dirs; use taxonomy from folder names |

**Time saved:** ~2.5 days (batches 13-14 removed). Phase D = ~20-24 days instead of 22-26.

---

## High-Value Taxonomy Extracted from GNB/ Skeleton

### Confirmed customer mapping

| GNB/ path | Customer | Objects |
|-----------|----------|---------|
| `ОЭК/СКМ ГРУПП/` | **1.СКМ ГРУПП** | Голенищево, Золоторожская (ГНБ 15, 16), Крылатские холмы, Кузьминки, Остафьево, Производственная, Рижская, Салтыковка, Текстильщики, Щербинка, Южнопортовая (ГНБ 18.1-18.2) |
| `_Требует уточнения компании/Крафт (компания не определена)/` | **3.Крафт** | ЗИЛ, МА, Марьино |
| `_Требует уточнения компании/Голосенко (СПК Смарт - ждёт подтверждения)/` | **4.Golosenko** (= СПК Смарт?) | ГНБ 25-26, ГНБ 8.2, 8.3, 8.4, 8.5-8.6, Истра, Красносельская, Лужники, Фили, Щелково, Ярославка |

### New/unknown customers (not in plan v6 numbered list)

| GNB/ path | Identified as | Objects | Status |
|-----------|--------------|---------|--------|
| `ОЭК/МК ГРУПП/` | **МК ГРУПП** — отдельный заказчик | 10 ГНБ, ГСН М7, Генерала Глагольева, МОСВОДОКАНАЛ, Москворечье, Речной вокзал, Саларьево, Снежная | Confirmed customer |
| `_Требует уточнения/Станислав (ИП Демидов - не подтв.)` | Возможно = **2.Дремин**? | Бадаевский-Красносельская, Волоколамка, Голенищево, Ельдигино | **Требует подтверждения владельца** |
| `_Требует уточнения/Артур ИП (компания не определена)` | ИП Артур | Борисово, Братиславская, Ленинский | Не в numbered list |
| `_Требует уточнения/Альфа Стандарт (нет карточки)` | Альфа Стандарт | Коммунарка | Не в numbered list |
| `_Требует уточнения/Золоторевка-Котловка (АТИС - ждёт подтверждения)` | АТИС? | — | Требует подтверждения |

### Unnumbered objects (no customer identified)

- Андропова, Карамышевская, Коломенская, Лужа, Лужники, Химки, Исполнительные

---

## Open Question for Owner (Priority Before Phase D)

**Q-D1: Станислав (ИП Демидов) = Дремин?**
- `2.Дремин` в нумерованном списке
- `Станислав (ИП Демидов)` в GNB/ таксономии — те же объекты (Бадаевский, Волоколамка, Ельдигино)
- Это один и тот же заказчик под двумя именами? Или два разных?
- **Default (24h молчание):** считаем Дремин ≠ Станислав, оба создаются отдельными customer-записями.

**Q-D2: Golosenko = СПК Смарт?**
- В нумерованном списке `4.Golosenko`
- В GNB/ таксономии `Голосенко (СПК Смарт - ждёт подтверждения)`
- Если да → `customers.name='Голосенко'`, `official_name='СПК Смарт'`.
- **Default (24h молчание):** да, Голосенко = СПК Смарт.

**Q-D3: МК ГРУПП — заказчик или подрядчик?**
- В Работа\ есть отдельная папка `МК ГРУПП/`
- В GNB/ это customer с 8 объектами и subdir-структурой как у numbered customers
- **Default:** создать как customer (batch 6 в плане).

---

## taxonomy.yaml seed (готово к использованию в Phase D)

Эта таксономия готова к переносу в `scripts/taxonomy.yaml` в Phase D:

```yaml
customers:
  skm-grupp:
    name: "СКМ ГРУПП"
    official_name: "1.СКМ ГРУПП"
    objects: [Голенищево, Золоторожская, Крылатские холмы, Кузьминки, Остафьево, Производственная, Рижская, Салтыковка, Текстильщики, Щербинка, Южнопортовая]
    source: GNB/ОЭК/СКМ ГРУПП/

  mk-grupp:
    name: "МК ГРУПП"
    objects: [10 ГНБ, ГСН М7, Генерала Глагольева, МОСВОДОКАНАЛ, Москворечье, Речной вокзал, Саларьево, Снежная]
    source: GNB/ОЭК/МК ГРУПП/

  kraft:
    name: "Крафт"
    objects: [ЗИЛ, МА, Марьино]
    source: "3.Крафт + GNB/_Требует уточнения/Крафт"

  golosenko:
    name: "Голосенко"
    official_name: "СПК Смарт"   # default: да
    objects: [ГНБ 25-26, ГНБ 8.2, ГНБ 8.3, ГНБ 8.4, ГНБ 8.5-8.6, Истра, Красносельская, Лужники, Фили, Щелково, Ярославка]
    source: "4.Golosenko + GNB/_Требует уточнения/Голосенко"

  dremin:
    name: "Дремин"
    objects: [Бадаевский, Волоколамка, Ельдигино, Карен, Красносельская, голенищево]
    note: "Проверить: = Станислав ИП Демидов?"
    source: "2.Дремин"

  artur-ip:
    name: "Артур ИП"
    objects: [Борисово, Братиславская, Ленинский]
    source: GNB/_Требует уточнения/Артур ИП

  alfa-standart:
    name: "Альфа Стандарт"
    objects: [Коммунарка]
    source: GNB/_Требует уточнения/Альфа Стандарт
```

---

## Actions

1. **Batches 13-14 удалены** из Phase D scope (0 файлов для ингеста).
2. **Taxonomy YAML** — использовать этот документ как seed при создании `scripts/taxonomy.yaml` в Phase D.
3. **Owner ответ на Q-D1/D2/D3** — до старта Phase D (batch 2 и 4).
