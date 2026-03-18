/**
 * IntakeDraftStore — CRUD for Draft Intake Mode drafts.
 *
 * Directory: .gnb-memory/intake-drafts/
 * Each draft is a separate JSON file: intake-drafts/{id}.json
 * TTL: 7 days.
 *
 * Separate from DraftStore (flow v1) — no migration needed.
 */

import fs from "node:fs";
import path from "node:path";
import { readJson, writeJson } from "./json-io.js";
import type {
  IntakeDraft,
  IntakeDraftStatus,
  SourceDocument,
  ExtractedField,
  FieldName,
} from "../intake/intake-types.js";
import { REQUIRED_FIELDS, DESIRED_FIELDS } from "../intake/intake-types.js";
import type { Transition } from "../domain/types.js";

const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export class IntakeDraftStore {
  private dir: string;

  constructor(memoryDir: string) {
    this.dir = path.join(memoryDir, "intake-drafts");
    if (!fs.existsSync(this.dir)) {
      fs.mkdirSync(this.dir, { recursive: true });
    }
  }

  private filePath(id: string): string {
    return path.join(this.dir, `${id}.json`);
  }

  // === CRUD ===

  get(id: string): IntakeDraft | null {
    return readJson<IntakeDraft | null>(this.filePath(id), null);
  }

  getByChatId(chatId: number): IntakeDraft | null {
    const active = this.listActive();
    return active.find((d) => d.chat_id === chatId) ?? null;
  }

  list(): IntakeDraft[] {
    if (!fs.existsSync(this.dir)) return [];
    const files = fs.readdirSync(this.dir).filter((f) => f.endsWith(".json"));
    return files
      .map((f) => readJson<IntakeDraft | null>(path.join(this.dir, f), null))
      .filter((d): d is IntakeDraft => d !== null);
  }

  listActive(): IntakeDraft[] {
    const now = Date.now();
    return this.list().filter((d) => {
      const age = now - new Date(d.updated_at).getTime();
      return age < DRAFT_TTL_MS;
    });
  }

  create(chatId: number): IntakeDraft {
    const id = `intake-${chatId}-${Date.now()}`;
    const now = new Date().toISOString();
    const draft: IntakeDraft = {
      id,
      chat_id: chatId,
      status: "collecting",
      created_at: now,
      updated_at: now,
      sources: [],
      fields: [],
      data: {},
    };
    writeJson(this.filePath(id), draft);
    return draft;
  }

  delete(id: string): void {
    const p = this.filePath(id);
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
    }
  }

  // === Status management ===

  setStatus(id: string, status: IntakeDraftStatus): void {
    const draft = this.get(id);
    if (!draft) throw new Error(`IntakeDraft ${id} not found`);
    draft.status = status;
    draft.updated_at = new Date().toISOString();
    writeJson(this.filePath(id), draft);
  }

  setBaseTransitionId(id: string, baseId: string): void {
    const draft = this.get(id);
    if (!draft) throw new Error(`IntakeDraft ${id} not found`);
    draft.base_transition_id = baseId;
    draft.updated_at = new Date().toISOString();
    writeJson(this.filePath(id), draft);
  }

  // === Source documents ===

  addSource(id: string, source: SourceDocument): void {
    const draft = this.get(id);
    if (!draft) throw new Error(`IntakeDraft ${id} not found`);
    draft.sources.push(source);
    draft.updated_at = new Date().toISOString();
    writeJson(this.filePath(id), draft);
  }

  updateSource(id: string, source: SourceDocument): void {
    const draft = this.get(id);
    if (!draft) throw new Error(`IntakeDraft ${id} not found`);
    const idx = draft.sources.findIndex((s) => s.source_id === source.source_id);
    if (idx >= 0) {
      draft.sources[idx] = source;
    } else {
      draft.sources.push(source);
    }
    draft.updated_at = new Date().toISOString();
    writeJson(this.filePath(id), draft);
  }

  // === Extracted fields ===

  /**
   * Set a field value with provenance.
   * If the field already exists and is confirmed by owner, does NOT overwrite
   * unless the new source is manual_text (owner override).
   * Returns true if field was updated, false if conflict was detected.
   */
  setField(
    id: string,
    field: ExtractedField,
    opts?: { schemeAuthoritative?: boolean },
  ): { updated: boolean; conflict: boolean } {
    const draft = this.get(id);
    if (!draft) throw new Error(`IntakeDraft ${id} not found`);

    const existingIdx = draft.fields.findIndex(
      (f) => f.field_name === field.field_name && !f.conflict_with_existing,
    );

    // Strip _merge from stored field value, but keep original for applyFieldToData merge logic
    const originalField = field;
    if (field.value && typeof field.value === "object" && "_merge" in (field.value as Record<string, unknown>)) {
      const { _merge, ...cleanValue } = field.value as Record<string, unknown>;
      field = { ...field, value: cleanValue };
    }

    if (existingIdx === -1) {
      // New field — just add
      draft.fields.push(field);
      this.applyFieldToData(draft, originalField); // use original with _merge for merge logic
      draft.updated_at = new Date().toISOString();
      writeJson(this.filePath(id), draft);
      return { updated: true, conflict: false };
    }

    const existing = draft.fields[existingIdx];

    // Owner override always wins
    if (field.source_type === "manual_text") {
      draft.fields[existingIdx] = field;
      this.applyFieldToData(draft, originalField);
      draft.updated_at = new Date().toISOString();
      writeJson(this.filePath(id), draft);
      return { updated: true, conflict: false };
    }

    // Same value — silently accept without conflict
    if (valuesEqual(existing.value, field.value)) {
      return { updated: false, conflict: false };
    }

    // Scheme-authoritative: ИС overrides base/inherited for this field
    if (opts?.schemeAuthoritative) {
      draft.fields[existingIdx] = field;
      this.applyFieldToData(draft, originalField);
      draft.updated_at = new Date().toISOString();
      writeJson(this.filePath(id), draft);
      return { updated: true, conflict: false };
    }

    // Routing fields (customer/object short names): ИС values don't conflict
    // These are navigation labels, not doc-generation values
    if (existing.source_id === "manual-identity") {
      // Existing routing field from /new_gnb selection — lower-priority doc source
      // doesn't conflict, just silently skip
      return { updated: false, conflict: false };
    }

    // Confirmed field cannot be overwritten by non-manual source
    if (existing.confirmed_by_owner) {
      field.conflict_with_existing = true;
      draft.fields.push(field);
      draft.updated_at = new Date().toISOString();
      writeJson(this.filePath(id), draft);
      return { updated: false, conflict: true };
    }

    // Higher-priority source wins over lower-priority
    if (sourcePriority(field.source_type) <= sourcePriority(existing.source_type)) {
      // For organization fields with equal priority, prefer the value with richer
      // legal details (ОГРН, ИНН, legal_address) over a shorter abbreviation.
      if (sourcePriority(field.source_type) === sourcePriority(existing.source_type)
        && isOrganizationField(field.field_name)
        && hasRicherLegalDetails(existing.value, field.value)) {
        // Existing value has more legal detail — don't overwrite, silently skip
        return { updated: false, conflict: false };
      }
      draft.fields[existingIdx] = field;
      this.applyFieldToData(draft, field);
      draft.updated_at = new Date().toISOString();
      writeJson(this.filePath(id), draft);
      return { updated: true, conflict: false };
    }

    // Lower-priority source — mark as conflict candidate
    field.conflict_with_existing = true;
    draft.fields.push(field);
    draft.updated_at = new Date().toISOString();
    writeJson(this.filePath(id), draft);
    return { updated: false, conflict: true };
  }

  /**
   * Confirm a field value (owner has verified it).
   */
  confirmField(id: string, fieldName: FieldName): void {
    const draft = this.get(id);
    if (!draft) throw new Error(`IntakeDraft ${id} not found`);
    const field = draft.fields.find(
      (f) => f.field_name === fieldName && !f.conflict_with_existing,
    );
    if (field) {
      field.confirmed_by_owner = true;
      draft.updated_at = new Date().toISOString();
      writeJson(this.filePath(id), draft);
    }
  }

  /**
   * Get the current (active) value for a field.
   * Returns the non-conflict field, or null if not set.
   */
  getField(id: string, fieldName: FieldName): ExtractedField | null {
    const draft = this.get(id);
    if (!draft) return null;
    return (
      draft.fields.find(
        (f) => f.field_name === fieldName && !f.conflict_with_existing,
      ) ?? null
    );
  }

  /**
   * Get all conflict candidates for a field.
   */
  getConflicts(id: string, fieldName: FieldName): ExtractedField[] {
    const draft = this.get(id);
    if (!draft) return [];
    return draft.fields.filter(
      (f) => f.field_name === fieldName && f.conflict_with_existing,
    );
  }

  // === Completeness ===

  /**
   * Check which required fields are missing.
   */
  getMissingRequired(id: string): FieldName[] {
    const draft = this.get(id);
    if (!draft) return [];
    const activeFields = new Set(
      draft.fields
        .filter((f) => !f.conflict_with_existing)
        .map((f) => f.field_name),
    );
    return REQUIRED_FIELDS.filter((f) => !activeFields.has(f));
  }

  /**
   * Check which desired fields are missing.
   */
  getMissingDesired(id: string): FieldName[] {
    const draft = this.get(id);
    if (!draft) return [];
    const activeFields = new Set(
      draft.fields
        .filter((f) => !f.conflict_with_existing)
        .map((f) => f.field_name),
    );
    return DESIRED_FIELDS.filter((f) => !activeFields.has(f));
  }

  /**
   * Check if draft has any unresolved conflicts.
   */
  hasConflicts(id: string): boolean {
    const draft = this.get(id);
    if (!draft) return false;
    return draft.fields.some((f) => f.conflict_with_existing);
  }

  // === TTL ===

  expireOld(): number {
    const now = Date.now();
    const all = this.list();
    let expired = 0;
    for (const d of all) {
      const age = now - new Date(d.updated_at).getTime();
      if (age >= DRAFT_TTL_MS) {
        this.delete(d.id);
        expired++;
      }
    }
    return expired;
  }

  // === Internal ===

  /**
   * Apply an extracted field value to draft.data (partial Transition).
   * This keeps draft.data in sync with fields[] for finalization.
   */
  private applyFieldToData(draft: IntakeDraft, field: ExtractedField): void {
    const d = draft.data;
    const v = field.value;

    switch (field.field_name) {
      // Flat string fields
      case "customer": d.customer = v as string; break;
      case "object": d.object = v as string; break;
      case "object_name": d.object_name = v as string; break;
      case "title_line": d.title_line = v as string; break;
      case "gnb_number": d.gnb_number = v as string; break;
      case "gnb_number_short": d.gnb_number_short = v as string; break;
      case "address": d.address = v as string; break;
      case "project_number": d.project_number = v as string; break;
      case "executor": d.executor = v as string; break;

      // Dates
      case "start_date": d.start_date = v as any; break;
      case "end_date": d.end_date = v as any; break;
      case "act_date": d.act_date = v as any; break;

      // Organizations (nested)
      case "organizations.customer":
        d.organizations = { ...d.organizations, customer: v } as any;
        break;
      case "organizations.contractor":
        d.organizations = { ...d.organizations, contractor: v } as any;
        break;
      case "organizations.designer":
        d.organizations = { ...d.organizations, designer: v } as any;
        break;

      // Signatories (nested)
      case "signatories.sign1_customer":
        d.signatories = { ...d.signatories, sign1_customer: v } as any;
        break;
      case "signatories.sign2_contractor":
        d.signatories = { ...d.signatories, sign2_contractor: v } as any;
        break;
      case "signatories.sign3_optional":
        d.signatories = { ...d.signatories, sign3_optional: v } as any;
        break;
      case "signatories.tech_supervisor":
        d.signatories = { ...d.signatories, tech_supervisor: v } as any;
        break;

      // Pipe / materials
      case "pipe":
        if (v && typeof v === "object" && (v as any)._merge) {
          // Merge mode: only update provided fields, preserve existing
          const { _merge, ...updates } = v as any;
          d.pipe = { ...(d.pipe || { mark: "", diameter: "", diameter_mm: 0 }), ...updates };
        } else {
          d.pipe = v as any;
        }
        break;
      case "materials": d.materials = v as any; break;

      // GNB params (nested)
      case "gnb_params.profile_length":
        d.gnb_params = { ...d.gnb_params, profile_length: v } as any;
        break;
      case "gnb_params.plan_length":
        d.gnb_params = { ...d.gnb_params, plan_length: v } as any;
        break;
      case "gnb_params.pipe_count":
        d.gnb_params = { ...d.gnb_params, pipe_count: v } as any;
        break;
      case "gnb_params.drill_diameter":
        d.gnb_params = { ...d.gnb_params, drill_diameter: v } as any;
        break;
    }
  }
}

// === Source priority (lower = higher priority) ===

const SOURCE_PRIORITY: Record<string, number> = {
  manual_text: 1,
  excel: 3,
  prior_act: 3,
  pdf: 4,
  photo: 5,
  memory: 6,
  inferred: 7,
};

function sourcePriority(type: string): number {
  return SOURCE_PRIORITY[type] ?? 99;
}

/** Check if a field name is an organization field. */
function isOrganizationField(fieldName: FieldName): boolean {
  return fieldName.startsWith("organizations.");
}

/**
 * Check if value `a` has richer legal details than value `b`.
 * Returns true if `a` contains ОГРН/ИНН/legal address and `b` does not,
 * or if `a` stringifies to significantly longer text (indicating full legal details).
 */
function hasRicherLegalDetails(a: unknown, b: unknown): boolean {
  const aStr = typeof a === "string" ? a : JSON.stringify(a ?? "");
  const bStr = typeof b === "string" ? b : JSON.stringify(b ?? "");

  const legalPattern = /ОГРН|ИНН|ogrn|inn|legal_address/i;
  const aHasLegal = legalPattern.test(aStr);
  const bHasLegal = legalPattern.test(bStr);

  // If existing has legal details and new doesn't, existing is richer
  if (aHasLegal && !bHasLegal) return true;

  // If both have or both lack legal patterns, compare by length
  // (full org details are typically 3x+ longer than abbreviations)
  if (!aHasLegal && !bHasLegal && aStr.length > bStr.length * 2) return true;

  return false;
}

/** Simple equality for field values — avoids false conflicts for identical data. */
function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (typeof a === "string" && typeof b === "string") return a.trim() === b.trim();
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 0.01;
  if (typeof a === "object" && typeof b === "object") {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}
