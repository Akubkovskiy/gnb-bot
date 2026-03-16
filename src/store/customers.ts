/**
 * CustomerStore — CRUD for customers and their objects.
 * File: .gnb-memory/customers.json
 */

import path from "node:path";
import { readJson, writeJson } from "./json-io.js";
import { slugify } from "../domain/ids.js";
import type { Customer, ObjectEntry } from "../domain/types.js";

interface CustomersFile {
  customers: Record<string, Customer>;
}

export class CustomerStore {
  private filePath: string;

  constructor(memoryDir: string) {
    this.filePath = path.join(memoryDir, "customers.json");
  }

  private load(): CustomersFile {
    return readJson<CustomersFile>(this.filePath, { customers: {} });
  }

  private save(data: CustomersFile): void {
    writeJson(this.filePath, data);
  }

  list(): Customer[] {
    return Object.values(this.load().customers);
  }

  get(slug: string): Customer | null {
    return this.load().customers[slug] ?? null;
  }

  /**
   * Find customer by name or alias (case-insensitive).
   */
  findByNameOrAlias(query: string): Customer | null {
    const lower = query.toLowerCase();
    const data = this.load();
    for (const c of Object.values(data.customers)) {
      if (c.name.toLowerCase() === lower) return c;
      if (c.aliases.some((a) => a.toLowerCase() === lower)) return c;
    }
    return null;
  }

  getObjects(slug: string): ObjectEntry[] {
    const customer = this.get(slug);
    if (!customer) return [];
    return Object.values(customer.objects);
  }

  add(customer: Customer): void {
    const data = this.load();
    if (!customer.slug) {
      customer.slug = slugify(customer.name);
    }
    if (data.customers[customer.slug]) {
      throw new Error(`Customer ${customer.slug} already exists`);
    }
    data.customers[customer.slug] = customer;
    this.save(data);
  }

  addObject(customerSlug: string, objectSlug: string, entry: ObjectEntry): void {
    const data = this.load();
    const customer = data.customers[customerSlug];
    if (!customer) throw new Error(`Customer ${customerSlug} not found`);
    customer.objects[objectSlug] = entry;
    this.save(data);
  }

  updateLastGnb(customerSlug: string, objectSlug: string, gnbNumber: string): void {
    const data = this.load();
    const customer = data.customers[customerSlug];
    if (!customer) throw new Error(`Customer ${customerSlug} not found`);
    const obj = customer.objects[objectSlug];
    if (!obj) throw new Error(`Object ${objectSlug} not found for ${customerSlug}`);
    obj.last_gnb = gnbNumber;
    this.save(data);
  }
}
