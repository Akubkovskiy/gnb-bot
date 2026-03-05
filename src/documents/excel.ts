import XLSX from "xlsx";
import fs from "node:fs";
import { logger } from "../logger.js";

/**
 * Читает первый лист .xls файла и возвращает все данные в текстовом виде.
 * Вместо хардкода ячеек — просто дампим содержимое для анализа Claude.
 */
export function readSheet1(filePath: string): { sheetName: string; text: string; rowCount: number } {
  const buf = fs.readFileSync(filePath);
  const workbook = XLSX.read(buf);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  if (!sheet) {
    throw new Error(`Лист "${sheetName}" не найден в файле`);
  }

  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
  const lines: string[] = [];

  for (let row = range.s.r; row <= range.e.r; row++) {
    const cells: string[] = [];
    let hasValue = false;
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddr = XLSX.utils.encode_cell({ r: row, c: col });
      const cell = sheet[cellAddr];
      const val = cell?.v !== undefined && cell?.v !== null && cell?.v !== "" ? String(cell.v) : "";
      cells.push(val);
      if (val) hasValue = true;
    }
    // Пропускаем полностью пустые строки
    if (hasValue) {
      // Убираем trailing пустые ячейки
      while (cells.length > 0 && cells[cells.length - 1] === "") cells.pop();
      lines.push(`R${row + 1}: ${cells.join(" | ")}`);
    }
  }

  const text = lines.join("\n");
  logger.info({ sheetName, rows: lines.length }, "Excel прочитан");
  return { sheetName, text, rowCount: lines.length };
}
