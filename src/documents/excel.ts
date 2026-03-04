import * as XLSX from "xlsx";
import { logger } from "../logger.js";

// Карта ключевых ячеек Лист1 из "Акты ГНБ" (row 1-indexed, col 1-indexed → R,C)
const KEY_CELLS: Record<string, string> = {
  "R2C1": "Наименование объекта",
  "R4C1": "Адрес",
  "R6C1": "Направление",
  "R7C12": "Заказчик",
  "R8C12": "Эксплуатация",
  "R9C12": "Генподрядчик",
  "R10C12": "Субподрядчик",
  "R12C1": "Номер перехода",
  "R14C1": "Номер/шифр проекта",
  "R16C1": "Проектировщик",
  "R18C1": "Дата начала (serial)",
  "R20C1": "Дата окончания (serial)",
  "R22C1": "Исполнитель",
  "R22C7": "Номер СРО",
  "R24C1": "Дата завершения текстом",
  "R38C1": "Марка трубы",
};

interface CellData {
  address: string;
  label: string;
  value: unknown;
}

/**
 * Читает первый лист .xls файла и возвращает данные ключевых ячеек.
 */
export function readSheet1(filePath: string): { allData: Record<string, unknown>; keyCells: CellData[] } {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  if (!sheet) {
    throw new Error(`Лист "${sheetName}" не найден в файле`);
  }

  // Собираем все данные
  const allData: Record<string, unknown> = {};
  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");

  for (let row = range.s.r; row <= range.e.r; row++) {
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddr = XLSX.utils.encode_cell({ r: row, c: col });
      const cell = sheet[cellAddr];
      if (cell && cell.v !== undefined && cell.v !== null && cell.v !== "") {
        allData[cellAddr] = cell.v;
      }
    }
  }

  // Извлекаем ключевые ячейки
  const keyCells: CellData[] = [];
  for (const [rc, label] of Object.entries(KEY_CELLS)) {
    const match = rc.match(/^R(\d+)C(\d+)$/);
    if (!match) continue;
    const row = parseInt(match[1]) - 1; // 0-indexed
    const col = parseInt(match[2]) - 1;
    const cellAddr = XLSX.utils.encode_cell({ r: row, c: col });
    const cell = sheet[cellAddr];
    keyCells.push({
      address: rc,
      label,
      value: cell?.v ?? null,
    });
  }

  logger.info({ sheetName, totalCells: Object.keys(allData).length }, "Excel прочитан");
  return { allData, keyCells };
}

/**
 * Форматирует данные ключевых ячеек для отображения в Telegram.
 */
export function formatKeyCells(keyCells: CellData[]): string {
  const lines = keyCells
    .filter((c) => c.value !== null)
    .map((c) => `📌 ${c.label}: ${c.value}`);

  if (lines.length === 0) return "⚠️ Ключевые ячейки пусты";
  return lines.join("\n");
}
