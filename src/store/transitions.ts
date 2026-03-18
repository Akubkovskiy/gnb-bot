/**
 * TransitionStore — CRUD for finalized GNB transitions.
 * File: .gnb-memory/gnb-transitions.json
 */

import path from "node:path";
import { readJson, writeJson } from "./json-io.js";
import type { Transition, Revision } from "../domain/types.js";

interface TransitionsFile {
  transitions: Transition[];
}

export class TransitionStore {
  private filePath: string;

  constructor(memoryDir: string) {
    this.filePath = path.join(memoryDir, "gnb-transitions.json");
  }

  private load(): TransitionsFile {
    return readJson<TransitionsFile>(this.filePath, { transitions: [] });
  }

  private save(data: TransitionsFile): void {
    writeJson(this.filePath, data);
  }

  list(): Transition[] {
    return this.load().transitions;
  }

  get(id: string): Transition | null {
    return this.load().transitions.find((t) => t.id === id) ?? null;
  }

  getByGnbNumber(gnbShort: string): Transition | null {
    return this.load().transitions.find((t) => t.gnb_number_short === gnbShort) ?? null;
  }

  findByCustomerObject(customer: string, object: string): Transition[] {
    const data = this.load();
    return data.transitions.filter(
      (t) => t.customer === customer && t.object === object,
    );
  }

  getLastForObject(customer: string, object: string): Transition | null {
    const matches = this.findByCustomerObject(customer, object);
    if (matches.length === 0) return null;
    // Sort by created_at descending, return newest
    return matches.sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  }

  create(transition: Transition): void {
    const data = this.load();
    const existingIdx = data.transitions.findIndex((t) => t.id === transition.id);
    if (existingIdx !== -1) {
      // Upsert: update existing transition with new data (re-generation)
      data.transitions[existingIdx] = transition;
    } else {
      data.transitions.push(transition);
    }
    this.save(data);
  }

  finalize(id: string): void {
    const data = this.load();
    const t = data.transitions.find((t) => t.id === id);
    if (!t) throw new Error(`Transition ${id} not found`);
    t.status = "finalized";
    t.finalized_at = new Date().toISOString();
    this.save(data);
  }

  addRevision(id: string, rev: Revision): void {
    const data = this.load();
    const t = data.transitions.find((t) => t.id === id);
    if (!t) throw new Error(`Transition ${id} not found`);
    t.revisions.push(rev);
    this.save(data);
  }

  /**
   * Update a transition's data fields (partial update).
   */
  update(id: string, updates: Partial<Transition>): void {
    const data = this.load();
    const idx = data.transitions.findIndex((t) => t.id === id);
    if (idx === -1) throw new Error(`Transition ${id} not found`);
    data.transitions[idx] = { ...data.transitions[idx], ...updates };
    this.save(data);
  }
}
