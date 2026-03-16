/**
 * DraftStore — CRUD for in-progress /new_gnb flow drafts.
 * Directory: .gnb-memory/drafts/
 * Each draft is a separate JSON file: drafts/{id}.json
 * TTL: 7 days (configurable).
 */

import fs from "node:fs";
import path from "node:path";
import { readJson, writeJson } from "./json-io.js";
import type { Draft } from "../domain/types.js";

const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export class DraftStore {
  private draftsDir: string;

  constructor(memoryDir: string) {
    this.draftsDir = path.join(memoryDir, "drafts");
    if (!fs.existsSync(this.draftsDir)) {
      fs.mkdirSync(this.draftsDir, { recursive: true });
    }
  }

  private draftPath(id: string): string {
    return path.join(this.draftsDir, `${id}.json`);
  }

  list(): Draft[] {
    if (!fs.existsSync(this.draftsDir)) return [];
    const files = fs.readdirSync(this.draftsDir).filter((f) => f.endsWith(".json"));
    return files
      .map((f) => readJson<Draft | null>(path.join(this.draftsDir, f), null))
      .filter((d): d is Draft => d !== null);
  }

  listActive(): Draft[] {
    const now = Date.now();
    return this.list().filter((d) => {
      const age = now - new Date(d.updated_at).getTime();
      return age < DRAFT_TTL_MS;
    });
  }

  get(id: string): Draft | null {
    return readJson<Draft | null>(this.draftPath(id), null);
  }

  getByChatId(chatId: number): Draft | null {
    const active = this.listActive();
    return active.find((d) => d.chat_id === chatId) ?? null;
  }

  create(id: string, chatId: number, step: number, partialData: Partial<Draft["data"]>): Draft {
    const now = new Date().toISOString();
    const draft: Draft = {
      id,
      step,
      chat_id: chatId,
      data: partialData,
      created_at: now,
      updated_at: now,
    };
    writeJson(this.draftPath(id), draft);
    return draft;
  }

  update(id: string, step: number, partialData: Partial<Draft["data"]>): void {
    const draft = this.get(id);
    if (!draft) throw new Error(`Draft ${id} not found`);
    draft.step = step;
    draft.data = { ...draft.data, ...partialData };
    draft.updated_at = new Date().toISOString();
    writeJson(this.draftPath(id), draft);
  }

  delete(id: string): void {
    const p = this.draftPath(id);
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
    }
  }

  /**
   * Delete drafts older than TTL. Returns count of expired drafts.
   */
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
}
