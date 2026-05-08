/**
 * PDF longitudinal profile extractor for GNB drilling protocols.
 *
 * Uses the existing ocrDocument() infrastructure (Claude CLI subprocess)
 * to extract survey points from a PDF of a GNB longitudinal profile.
 *
 * No external PDF libraries required — Claude CLI reads PDF natively
 * via its built-in Read tool.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ocrDocument } from "../claude.js";
import type { RawPoint } from "../domain/protocol-types.js";
import { validatePoints } from "../parser/coord-catalog.js";

// ---------------------------------------------------------------------------
// Extraction prompt
// ---------------------------------------------------------------------------

export const PROTOCOL_PDF_PROMPT = `
Перед тобой чертёж — продольный профиль горизонтального направленного бурения (ГНБ).
Найди таблицу точек профиля трассы (каталог координат).

Извлеки данные в JSON строго по формату ниже:

Если в таблице есть координаты X, Y, H (или N/E + H):
{"points": [{"n": 1, "x": 419854.23, "y": 142367.81, "h": 147.52}, ...]}

Если есть только пикеты (ПК0+00, ПК0+25) и высотные отметки H:
{"points": [{"n": 1, "pk": 0.00, "h": 147.52}, ...]}

Правила:
- n: номер точки (целое число)
- x, y: координаты в метрах (десятичная точка, не запятая)
- h: высотная отметка оси скважины или земли — уточни по подписи (в метрах)
- pk: пикетное расстояние от начала трассы (ПК0+25 = 25.0)
- Только числовые значения, без единиц измерения
- Если координаты размыты или не читаются — пропусти точку
- Верни ТОЛЬКО JSON, без пояснений, без markdown-блоков
`.trim();

// ---------------------------------------------------------------------------
// JSON extraction helper
// ---------------------------------------------------------------------------

function extractJson(text: string): unknown {
  // Find first { ... } block
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("JSON не найден в ответе Claude");
  }
  return JSON.parse(text.slice(start, end + 1));
}

// ---------------------------------------------------------------------------
// Point normalizer
// ---------------------------------------------------------------------------

function normalizePoint(raw: Record<string, unknown>, index: number): RawPoint | null {
  const n = typeof raw.n === "number" ? raw.n : parseInt(String(raw.n ?? index + 1), 10);
  const h = typeof raw.h === "number" ? raw.h : parseFloat(String(raw.h ?? ""));
  if (isNaN(h)) return null;

  // XYH
  if (raw.x !== undefined && raw.y !== undefined) {
    const x = typeof raw.x === "number" ? raw.x : parseFloat(String(raw.x));
    const y = typeof raw.y === "number" ? raw.y : parseFloat(String(raw.y));
    if (!isNaN(x) && !isNaN(y)) return { n, x, y, h };
  }

  // Chainage
  if (raw.pk !== undefined) {
    const pk = typeof raw.pk === "number" ? raw.pk : parseFloat(String(raw.pk));
    if (!isNaN(pk)) return { n, pk, h };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Main extractor
// ---------------------------------------------------------------------------

export interface PdfExtractionResult {
  points: RawPoint[];
  /** true if accuracy warnings were triggered */
  beta?: boolean;
  /** raw Claude response for debugging */
  rawResponse?: string;
}

/**
 * Extract survey points from a GNB longitudinal profile PDF.
 *
 * @param pdfPath  Absolute path to the PDF file.
 * @param timeoutMs  Timeout for Claude CLI call (default 60s).
 */
export async function extractProfileFromPdf(
  pdfPath: string,
  timeoutMs = 60_000,
): Promise<PdfExtractionResult> {
  const absPath = path.resolve(pdfPath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`PDF не найден: ${absPath}`);
  }

  let rawResponse: string;
  try {
    rawResponse = await ocrDocument(absPath, PROTOCOL_PDF_PROMPT);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Claude Vision extraction failed: ${msg}`);
  }

  // Parse JSON from response
  let parsed: unknown;
  try {
    parsed = extractJson(rawResponse);
  } catch {
    throw new Error(
      `Не удалось разобрать JSON из ответа Claude.\n` +
      `Ответ: ${rawResponse.slice(0, 300)}`
    );
  }

  const raw = parsed as Record<string, unknown>;
  const rawPoints = Array.isArray(raw.points) ? raw.points : [];
  const normalized: RawPoint[] = [];

  for (let i = 0; i < rawPoints.length; i++) {
    const pt = normalizePoint(rawPoints[i] as Record<string, unknown>, i);
    if (pt !== null) normalized.push(pt);
  }

  // Validate
  const points = validatePoints(normalized);

  return { points, rawResponse };
}

// ---------------------------------------------------------------------------
// Telegram helper — download temp file, extract, cleanup
// ---------------------------------------------------------------------------

/**
 * Download a Telegram file to a temp path, extract profile points, then delete.
 */
export async function extractProfileFromTelegramFile(
  downloadUrl: string,
  fetch: (url: string) => Promise<{ arrayBuffer(): Promise<ArrayBuffer> }>,
  timeoutMs = 60_000,
): Promise<PdfExtractionResult> {
  const tmpPath = path.join(os.tmpdir(), `gnb-profile-${Date.now()}.pdf`);
  try {
    const res = await fetch(downloadUrl);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(tmpPath, buf);
    return await extractProfileFromPdf(tmpPath, timeoutMs);
  } finally {
    await fs.promises.unlink(tmpPath).catch(() => {});
  }
}
