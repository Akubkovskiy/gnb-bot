import ExcelJS from "exceljs";
import fs from "node:fs";
import path from "node:path";
import { logger } from "../logger.js";
import { getTempDir } from "../utils/paths.js";

const TEMPLATE_PATH = path.join(process.cwd(), "templates", "Акты ГНБ шаблон v2.xlsx");

export interface ActData {
  // Секция 1: Идентификация (строки 2–11)
  title_line?: string;       // B3 — Наименование объекта (КЛ ГНБ)
  object_name?: string;      // B4 — Название стройки / объект
  address?: string;          // B5 — Адрес
  gnb_number?: string;       // B6 — Номер ГНБ перехода
  project_number?: string;   // B7 — Номер/шифр проекта
  start_date?: string;       // B8 — Дата начала работ
  end_date?: string;         // B9 — Дата окончания работ
  executor?: string;         // B10 — Исполнитель (организация)
  completion_date?: string;  // B11 — Дата завершения работ

  // Секция 2: Организации (строки 13–16)
  customer?: string;         // B14 — Заказчик
  contractor?: string;       // B15 — Подрядчик
  designer?: string;         // B16 — Проектировщик

  // Секция 3: Подписанты (строки 18–23)
  // B-колонка = описание (орг + должн. + ФИО)
  // C-колонка = подпись для актов (с чертой)
  sign1_desc?: string;       // B20 — Представитель АО «ОЭК» (описание)
  sign1_line?: string;       // C20 — Подпись 1 (с чертой)
  sign2_desc?: string;       // B21 — Подрядчик (описание)
  sign2_line?: string;       // C21 — Подпись 2 (с чертой)
  sign3_desc?: string;       // B22 — Субподрядчик / опцион. (описание)
  sign3_line?: string;       // C22 — Подпись 3 (с чертой)
  tech_desc?: string;        // B23 — Тех.надзор (описание)
  tech_line?: string;        // C23 — Подпись тех.надзора (с чертой)

  // Секция 4: Труба (строки 25–27)
  pipe_mark?: string;        // B26 — Марка трубы (полная, с паспортом)
  pipe_diameter?: string;    // B27 — Диаметр трубы

  // Секция 5: Параметры ГНБ (строки 29–31)
  // Заголовки в строке 30, значения в строке 31
  plan_length?: number;      // B31 — L план
  profile_length?: number;   // C31 — L профиль
  pipe_count?: number;       // D31 — Кол-во труб
  drill_diameter?: number;   // F31 — d скважины
  configuration?: string;    // G31 — Конфигурация
}

// Карта: ключ JSON -> адрес ячейки на Лист1 (v3 layout / v2 шаблон)
const CELL_MAP: Record<string, string> = {
  // Идентификация
  title_line:       "B3",
  object_name:      "B4",
  address:          "B5",
  gnb_number:       "B6",
  project_number:   "B7",
  start_date:       "B8",
  end_date:         "B9",
  executor:         "B10",
  completion_date:  "B11",
  // Организации
  customer:         "B14",
  contractor:       "B15",
  designer:         "B16",
  // Подписанты (описание)
  sign1_desc:       "B20",
  sign2_desc:       "B21",
  sign3_desc:       "B22",
  tech_desc:        "B23",
  // Подписанты (подпись с чертой)
  sign1_line:       "C20",
  sign2_line:       "C21",
  sign3_line:       "C22",
  tech_line:        "C23",
  // Труба
  pipe_mark:        "B26",
  pipe_diameter:    "B27",
  // Параметры ГНБ
  plan_length:      "B31",
  profile_length:   "C31",
  pipe_count:       "D31",
  drill_diameter:   "F31",
  configuration:    "G31",
};

/**
 * Заполняет шаблон "Акты ГНБ" данными и возвращает путь к .xlsx файлу.
 * Формулы на остальных 10 листах обновятся автоматически при открытии в Excel.
 *
 * @deprecated Use `renderInternalActs` from `../renderer/internal-acts.js` instead.
 * This function uses flat key-value pairs; the new renderer works with domain Transition objects.
 * Will be removed after Phase 4 integration.
 */
export async function fillActTemplate(
  data: ActData,
  outputFileName: string,
): Promise<string> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TEMPLATE_PATH);

  const sheet = wb.getWorksheet("Лист1");
  if (!sheet) throw new Error("Лист1 не найден в шаблоне");

  const filled: string[] = [];

  for (const [key, addr] of Object.entries(CELL_MAP)) {
    const value = (data as Record<string, unknown>)[key];
    if (value !== undefined && value !== null && value !== "") {
      sheet.getCell(addr).value = value as ExcelJS.CellValue;
      filled.push(key);
    }
  }

  // A31 (номер ГНБ в таблице параметров) = gnb_number если не указан отдельно
  if (data.gnb_number) {
    sheet.getCell("A31").value = data.gnb_number;
    filled.push("A31 (auto)");
  }

  const tempDir = getTempDir();
  fs.mkdirSync(tempDir, { recursive: true });

  if (!outputFileName.endsWith(".xlsx")) {
    outputFileName = outputFileName.replace(/\.xls$/, "") + ".xlsx";
  }

  const outputPath = path.join(tempDir, outputFileName);
  await wb.xlsx.writeFile(outputPath);

  logger.info({ outputPath, filledCount: filled.length }, "Act template filled");
  return outputPath;
}
