/**
 * Shared JSON file read/write helpers for all stores.
 * All stores persist to .gnb-memory/ as JSON files.
 */

import fs from "node:fs";
import path from "node:path";
import { logger } from "../logger.js";

/**
 * Read a JSON file safely. Returns parsed data or fallback.
 */
export function readJson<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch (err) {
    logger.warn({ err, filePath }, "Failed to read JSON file");
    return fallback;
  }
}

/**
 * Write data to a JSON file atomically (write to .tmp, then rename).
 */
export function writeJson(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const tmp = filePath + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmp, filePath);
}
