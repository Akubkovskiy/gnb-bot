// Конвертация дат для Excel

const MONTHS_RU = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

// Дата → Excel serial number (для "Акты ГНБ")
export function dateToExcelSerial(date: Date): number {
  const epoch = new Date(1899, 11, 30); // Excel epoch: 30.12.1899
  const diff = date.getTime() - epoch.getTime();
  return Math.floor(diff / (24 * 60 * 60 * 1000));
}

// Excel serial number → Date
export function excelSerialToDate(serial: number): Date {
  const epoch = new Date(1899, 11, 30);
  return new Date(epoch.getTime() + serial * 24 * 60 * 60 * 1000);
}

// Дата → компоненты для АОСР (день, месяц текстом, год)
export function dateToAosrParts(date: Date): { day: number; month: string; year: number } {
  return {
    day: date.getDate(),
    month: MONTHS_RU[date.getMonth()],
    year: date.getFullYear(),
  };
}

// Строка "12.10.2025" → Date
export function parseRuDate(str: string): Date {
  const [day, month, year] = str.split(".").map(Number);
  return new Date(year, month - 1, day);
}

// Дата → текст "«22» октября 2025 г."
export function dateToRuText(date: Date): string {
  const day = date.getDate();
  const month = MONTHS_RU[date.getMonth()];
  const year = date.getFullYear();
  return `«${day}» ${month} ${year} г.`;
}
