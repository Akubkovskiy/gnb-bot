import fs from "node:fs";
import path from "node:path";
import { getMemoryDir } from "../utils/paths.js";
import { logger } from "../logger.js";

// Начальные данные для каждого JSON-файла
const INITIAL_FILES: Record<string, object> = {
  "projects.json": { projects: [] },
  "people.json": { specialists: [] },
  "organizations.json": { organizations: [] },
  "gnb-transitions.json": { transitions: [] },
  "customers.json": { customers: {} },
  "preferences.json": {
    default_city: "г. Москва",
    default_pipe_count: 2,
    typical_responses: { pipe_same: true, sign3_present: true },
  },
};

/**
 * Создаёт директорию .gnb-memory и пустые JSON-файлы если их нет.
 */
export function initMemory(): void {
  const memDir = getMemoryDir();

  // Создаём директории (docs/ и drafts/)
  for (const subDir of ["docs", "drafts"]) {
    const dirPath = path.join(memDir, subDir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      logger.info({ path: dirPath }, `Создана директория .gnb-memory/${subDir}`);
    }
  }

  // Создаём JSON-файлы если не существуют
  for (const [filename, initial] of Object.entries(INITIAL_FILES)) {
    const filePath = path.join(memDir, filename);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(initial, null, 2), "utf-8");
      logger.info({ file: filename }, "Создан файл памяти");
    }
  }

  logger.info({ memDir }, "Память инициализирована");
}
