import fs from "node:fs";
import path from "node:path";
import { getMemoryDir, getWorkRoot } from "../utils/paths.js";
import { logger } from "../logger.js";

// Читает JSON-файл из .gnb-memory, возвращает объект или null
function readJsonSafe(filePath: string): unknown {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (err) {
    logger.warn({ err, filePath }, "Не удалось прочитать JSON");
    return null;
  }
}

// Список папок заказчиков и объектов на Яндекс Диске
function listProjectFolders(): string[] {
  const root = getWorkRoot();
  const result: string[] = [];
  try {
    const customers = fs.readdirSync(root, { withFileTypes: true });
    for (const c of customers) {
      if (!c.isDirectory() || c.name.startsWith(".")) continue;
      const objects = fs.readdirSync(path.join(root, c.name), { withFileTypes: true });
      for (const o of objects) {
        if (!o.isDirectory() || o.name.startsWith(".")) continue;
        result.push(`${c.name}/${o.name}`);
      }
    }
  } catch { /* директория может не существовать */ }
  return result;
}

/**
 * Собирает контекст из .gnb-memory для передачи в промпт Claude.
 * Включает: проекты, специалисты, переходы ГНБ, структуру папок.
 */
export function buildMemoryContext(): string {
  const memDir = getMemoryDir();

  const projects = readJsonSafe(path.join(memDir, "projects.json"));
  const people = readJsonSafe(path.join(memDir, "people.json"));
  const transitions = readJsonSafe(path.join(memDir, "gnb-transitions.json"));
  const orgs = readJsonSafe(path.join(memDir, "organizations.json"));
  const folders = listProjectFolders();

  const parts: string[] = [];
  parts.push("## Текущая база знаний (.gnb-memory)\n");

  // Проекты
  if (projects && typeof projects === "object" && "projects" in projects) {
    const arr = (projects as { projects: unknown[] }).projects;
    if (arr.length > 0) {
      parts.push(`### Проекты (${arr.length}):`);
      parts.push("```json");
      parts.push(JSON.stringify(arr, null, 2));
      parts.push("```\n");
    } else {
      parts.push("### Проекты: пусто\n");
    }
  }

  // Специалисты
  if (people && typeof people === "object" && "specialists" in people) {
    const arr = (people as { specialists: unknown[] }).specialists;
    if (arr.length > 0) {
      parts.push(`### Специалисты (${arr.length}):`);
      parts.push("```json");
      parts.push(JSON.stringify(arr, null, 2));
      parts.push("```\n");
    } else {
      parts.push("### Специалисты: пусто\n");
    }
  }

  // Переходы ГНБ
  if (transitions && typeof transitions === "object" && "transitions" in transitions) {
    const arr = (transitions as { transitions: unknown[] }).transitions;
    if (arr.length > 0) {
      parts.push(`### Переходы ГНБ (${arr.length}):`);
      parts.push("```json");
      parts.push(JSON.stringify(arr, null, 2));
      parts.push("```\n");
    } else {
      parts.push("### Переходы ГНБ: пусто\n");
    }
  }

  // Организации
  if (orgs && typeof orgs === "object" && "organizations" in orgs) {
    const arr = (orgs as { organizations: unknown[] }).organizations;
    if (arr.length > 0) {
      parts.push(`### Организации (${arr.length}):`);
      parts.push("```json");
      parts.push(JSON.stringify(arr, null, 2));
      parts.push("```\n");
    }
  }

  // Структура папок
  if (folders.length > 0) {
    parts.push(`### Папки проектов на Яндекс Диске (${folders.length}):`);
    for (const f of folders) {
      parts.push(`- ${f}`);
    }
    parts.push("");
  }

  return parts.join("\n");
}
