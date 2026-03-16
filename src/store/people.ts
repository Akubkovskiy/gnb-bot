/**
 * PeopleStore — CRUD for specialists/signatories.
 * File: .gnb-memory/people.json
 */

import path from "node:path";
import { readJson, writeJson } from "./json-io.js";
import { generatePersonId } from "../domain/ids.js";
import type { Person } from "../domain/types.js";

interface PeopleFile {
  specialists: Person[];
}

export class PeopleStore {
  private filePath: string;

  constructor(memoryDir: string) {
    this.filePath = path.join(memoryDir, "people.json");
  }

  private load(): PeopleFile {
    return readJson<PeopleFile>(this.filePath, { specialists: [] });
  }

  private save(data: PeopleFile): void {
    writeJson(this.filePath, data);
  }

  list(): Person[] {
    return this.load().specialists;
  }

  get(personId: string): Person | null {
    return this.load().specialists.find((p) => p.person_id === personId) ?? null;
  }

  /**
   * Find people by surname (case-insensitive, partial match).
   * "Гайдуков" → matches "Гайдуков Н.И."
   */
  findByName(surname: string): Person[] {
    const lower = surname.toLowerCase();
    return this.load().specialists.filter((p) =>
      p.full_name.toLowerCase().startsWith(lower),
    );
  }

  add(person: Person): void {
    const data = this.load();
    // Auto-generate person_id if not set
    if (!person.person_id) {
      person.person_id = generatePersonId(person.full_name);
    }
    // Check for duplicates
    if (data.specialists.some((p) => p.person_id === person.person_id)) {
      throw new Error(`Person ${person.person_id} already exists`);
    }
    data.specialists.push(person);
    this.save(data);
  }

  update(personId: string, updates: Partial<Person>): void {
    const data = this.load();
    const idx = data.specialists.findIndex((p) => p.person_id === personId);
    if (idx === -1) throw new Error(`Person ${personId} not found`);
    data.specialists[idx] = { ...data.specialists[idx], ...updates };
    this.save(data);
  }
}
