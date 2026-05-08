/**
 * GNB (Horizontal Directional Drilling) geometry calculator.
 *
 * Converts an array of RawPoints (XYH catalog or chainage profile)
 * into ProtocolPoints for the drilling protocol renderer.
 */

import type { ProtocolPoint, RawPoint } from "../domain/protocol-types.js";

export interface SectionData {
  section_length_m: number; // horizontal length, rounded to 2 decimals
  slope: number;            // -(dh / len), 2 decimals; positive = going down
}

/**
 * Calculate section geometry between two consecutive survey points.
 *
 * Formulas verified against Zolotorozhskaya ГНБ №16:
 *   section 1: len=7.40m, slope=0.32 ✓
 *   section 9: slope=-0.03 (head going up) ✓
 */
export function calcSection(prev: RawPoint, curr: RawPoint): SectionData {
  const dh = curr.h - prev.h;
  let len: number;

  if ("x" in curr && "x" in prev) {
    // XYH catalog: horizontal Euclidean distance
    const dx = curr.x - prev.x;
    const dy = curr.y - prev.y;
    len = Math.sqrt(dx * dx + dy * dy);
  } else if ("pk" in curr && "pk" in prev) {
    // Chainage profile: station difference
    len = curr.pk - prev.pk;
  } else {
    throw new Error(
      `Несовместимые типы точек: точки ${prev.n} и ${curr.n} — разные форматы (XYH vs пикетаж)`
    );
  }

  if (len <= 0) {
    throw new Error(
      `Нулевая или отрицательная длина участка между точками ${prev.n} и ${curr.n} (len=${len.toFixed(3)})`
    );
  }

  return {
    section_length_m: Math.round(len * 100) / 100,
    slope: Math.round(-(dh / len) * 100) / 100,
  };
}

/**
 * Convert a RawPoint array into ProtocolPoints.
 * depth_cm is always left undefined — it's a field measurement.
 */
export function calcProtocol(points: RawPoint[]): ProtocolPoint[] {
  if (points.length < 2) {
    throw new Error(`Нужно минимум 2 точки, получено: ${points.length}`);
  }

  const result: ProtocolPoint[] = [];
  for (let i = 1; i < points.length; i++) {
    const { section_length_m, slope } = calcSection(points[i - 1], points[i]);
    result.push({
      n: i,
      section_length_m,
      slope,
      depth_cm: undefined,
    });
  }
  return result;
}
