import path from "node:path";
import { config } from "../config.js";

// Корневая папка работы на Яндекс Диске
export function getWorkRoot(): string {
  return path.join(config.storageRoot, config.workRoot);
}

// Папка .gnb-memory
export function getMemoryDir(): string {
  return path.join(getWorkRoot(), config.memoryDir);
}

// Папка проекта: Работа\[Заказчик]\[Объект]
export function getProjectDir(customer: string, object: string): string {
  return path.join(getWorkRoot(), customer, object);
}

// Папка temp для загруженных файлов
export function getTempDir(): string {
  return path.join(process.cwd(), "temp_files");
}
