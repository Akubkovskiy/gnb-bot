import ExcelJS from "exceljs";
import fs from "node:fs";
import path from "node:path";
import { logger } from "../logger.js";
import { getTempDir } from "../utils/paths.js";

const TEMPLATE_PATH = path.join(process.cwd(), "templates", "Акты ОЭК шаблон.xlsx");

export interface ActData {
  // Секция 1: Идентификация
  title_line?: string;       // B3 — Наименование объекта (КЛ ГНБ)
  object_name?: string;      // B4 — Название стройки / объект
  address?: string;          // B5 — Адрес
  gnb_number?: string;       // B6 — Номер ГНБ перехода
  project_number?: string;   // B7 — Номер/шифр проекта
  start_date?: string;       // B8 — Дата начала работ
  end_date?: string;         // B9 — Дата окончания работ
  executor?: string;         // B10 — Исполнитель
  completion_date?: string;  // B11 — Дата завершения

  // Секция 2: Организации
  customer?: string;         // B14 — Заказчик
  general_contractor?: string; // B15 — Генподрядчик
  subcontractor_org?: string; // B16 — Субподрядчик (орг)
  designer?: string;         // B17 — Проектировщик

  // Секция 3: Представители
  exploitation?: string;     // B20 — Представитель эксплуатации
  gen_representative?: string; // B21 — Представитель генподрядчика
  subcontractor?: string;    // B22 — Представитель субподрядчика
  supervision_rep?: string;  // B23 — Представитель тех.надзора

  // Секция 4: Подписи
  sign_exploitation?: string; // B26 — Подпись 1
  sign_general?: string;     // B27 — Подпись 2
  sign_geodesist?: string;   // B28 — Подпись 3
  sign_extra?: string;       // B29 — Подпись 4

  // Секция 5: Труба
  pipe_mark?: string;        // B32 — Марка трубы
  pipe_diameter?: string;    // B33 — Диаметр трубы

  // Секция 6: Параметры ГНБ (строка 37)
  plan_length?: number;      // B37 — L план
  profile_length?: number;   // C37 — L профиль
  pipe_count?: number;       // D37 — Кол-во труб
  drill_diameter?: number;   // F37 — d скважины
  configuration?: string;    // G37 — Конфигурация
}

// Карта: ключ JSON -> адрес ячейки на Лист1 (v2)
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
  general_contractor: "B15",
  subcontractor_org: "B16",
  designer:         "B17",
  // Представители
  exploitation:     "B20",
  gen_representative: "B21",
  subcontractor:    "B22",
  supervision_rep:  "B23",
  // Подписи
  sign_exploitation: "B26",
  sign_general:     "B27",
  sign_geodesist:   "B28",
  sign_extra:       "B29",
  // Труба
  pipe_mark:        "B32",
  pipe_diameter:    "B33",
  // Параметры ГНБ
  plan_length:      "B37",
  profile_length:   "C37",
  pipe_count:       "D37",
  drill_diameter:   "F37",
  configuration:    "G37",
};

/**
 * Заполняет шаблон "Акты ОЭК" данными и возвращает путь к .xlsx файлу.
 * Формулы на остальных 9 листах обновятся автоматически при открытии в Excel.
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

  // A37 (номер ГНБ в таблице) = gnb_number если не указан отдельно
  if (data.gnb_number) {
    sheet.getCell("A37").value = data.gnb_number;
    filled.push("A37 (auto)");
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
