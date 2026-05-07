/**
 * Seed/migration bridge: populate SQLite from existing JSON stores.
 *
 * Reads gnb-customers.json, gnb-people.json, transitions/*.json
 * and writes into SQLite via repositories.
 *
 * Safe to run multiple times (upsert-based).
 */

import fs from "node:fs";
import path from "node:path";
import { getDb } from "./client.js";
import { createRepos } from "./repositories.js";
import { logger } from "../logger.js";

interface JsonCustomer {
  slug?: string;
  name: string;
  aliases?: string[];
  objects?: Record<string, { name: string; path?: string; last_gnb?: string }>;
}

interface JsonPerson {
  id?: string;
  person_id?: string;
  full_name: string;
  position?: string;
  position_long?: string;
  organization?: string;
  role?: string;
  nrs_id?: string;
  nrs_date?: string;
  order_type?: string;
  order_number?: string;
  order_date?: string;
  aosr_full_line?: string;
}

export function seedFromJson(memoryDir: string): { customers: number; people: number; transitions: number } {
  const db = getDb(memoryDir);
  const repos = createRepos(db);
  const stats = { customers: 0, people: 0, transitions: 0 };

  // === Seed known organizations (OEK + MKS ecosystems) ===
  const knownOrgs = [
    { id: "oek", name: "АО «Объединенная энергетическая компания»", short_name: "АО «ОЭК»", inn: "7720522853", ogrn: "1057746394155", legal_address: "115035, г. Москва, Раушская наб., д.8", phone: "8 (495) 657-91-01", sro_name: "Ассоциация строительных компаний «Межрегиональный строительный комплекс»" },
    { id: "stroytrest", name: "АНО «ОЭК Стройтрест»", short_name: "АНО «ОЭК Стройтрест»", inn: "7708442087", ogrn: "1247700649591", legal_address: "107078, г. Москва, ул Каланевская, д. 11, стр.2, помещ. 415", phone: "+7(495)228-19-79", sro_name: "Саморегулируемая организация" },
    { id: "sis", name: "ООО «СПЕЦИНЖСТРОЙ»", short_name: "ООО «СПЕЦИНЖСТРОЙ»", inn: "7806258664", ogrn: "1167847487444", legal_address: "123001, г. Москва, ул. Садовая-Кудринская, д. 25, помещ. 2/4", phone: "", sro_name: "Ассоциация «Объединение проектных организаций»", sro_number: "СРО-С-265-10042013", sro_date: "22.12.2020" },
    { id: "mks", name: "Филиал ПАО «Россети Московский регион» - Московские кабельные сети", short_name: "МКС", inn: "5036065113", ogrn: "1057746555811", legal_address: "115114, г. Москва, 2-й Павелецкий проезд, дом 3, корп.2", phone: "8(495)668-22-28", sro_name: "" },
  ];
  for (const org of knownOrgs) {
    repos.orgs.upsert(org);
  }

  // === Seed customers from JSON ===
  for (const fileName of ["gnb-customers.json", "customers.json"]) {
    const filePath = path.join(memoryDir, fileName);
    if (!fs.existsSync(filePath)) continue;

    try {
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      const customersMap: Record<string, JsonCustomer> = data.customers || {};

      for (const [slug, cust] of Object.entries(customersMap)) {
        const c = cust as JsonCustomer;
        if (!c.name) continue;

        // Find org if official_name matches
        const orgId = c.name.includes("ОЭК") ? "oek" : undefined;

        repos.customers.upsert(
          { id: slug, name: c.name, org_id: orgId },
          c.aliases || [c.name.toLowerCase()],
        );
        stats.customers++;

        // Seed objects
        if (c.objects) {
          for (const [objSlug, obj] of Object.entries(c.objects)) {
            repos.objects.upsert({
              id: `${slug}-${objSlug}`,
              customer_id: slug,
              short_name: obj.name,
            });
          }
        }
      }
    } catch (err) {
      logger.warn({ err, fileName }, "Failed to parse customer JSON");
    }
  }

  // === Seed people from JSON ===
  for (const fileName of ["gnb-people.json", "people.json"]) {
    const filePath = path.join(memoryDir, fileName);
    if (!fs.existsSync(filePath)) continue;

    try {
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      const specialists: JsonPerson[] = data.specialists || [];

      for (const p of specialists) {
        const pid = p.id || p.person_id || slugify(p.full_name);
        const surname = p.full_name.split(" ")[0];

        // Determine org
        let orgId: string | undefined;
        if (p.organization?.includes("ОЭК") && !p.organization?.includes("Стройтрест")) orgId = "oek";
        else if (p.organization?.includes("Стройтрест")) orgId = "stroytrest";
        else if (p.organization?.includes("СПЕЦИНЖСТРОЙ")) orgId = "sis";

        repos.people.upsert({
          id: pid,
          full_name: p.full_name,
          surname,
          position: p.position,
          position_long: p.position_long,
          org_id: orgId,
          nrs_id: p.nrs_id,
          nrs_date: p.nrs_date,
          aosr_full_line: p.aosr_full_line,
        });
        stats.people++;

        // Seed person document if order data present
        if (p.order_number) {
          repos.personDocs.insert({
            person_id: pid,
            doc_type: p.order_type || "приказ",
            doc_number: p.order_number,
            doc_date: p.order_date,
            role_granted: p.role,
            is_current: 1,
          });
        }
      }
    } catch (err) {
      logger.warn({ err, fileName }, "Failed to parse people JSON");
    }
  }

  // === Seed transitions from JSON files ===
  const transDir = path.join(memoryDir, "transitions");
  if (fs.existsSync(transDir)) {
    for (const file of fs.readdirSync(transDir).filter((f) => f.endsWith(".json"))) {
      try {
        const t = JSON.parse(fs.readFileSync(path.join(transDir, file), "utf-8"));
        if (!t.id) continue;

        // Determine object_id
        const custSlug = slugify(t.customer || "");
        const objSlug = slugify(t.object || "");
        const objectId = `${custSlug}-${objSlug}`;

        // Ensure object exists
        repos.objects.upsert({
          id: objectId,
          customer_id: custSlug,
          short_name: t.object || "",
          official_name: t.object_name,
          title_line: t.title_line,
          default_address: t.address,
          default_project_number: t.project_number,
        });

        // Ensure customer exists
        repos.customers.upsert({ id: custSlug, name: t.customer || custSlug }, []);

        // Determine executor org
        let executorId: string | undefined;
        if (t.executor?.includes("СПЕЦИНЖСТРОЙ")) executorId = "sis";
        else if (t.executor?.includes("Стройтрест")) executorId = "stroytrest";

        repos.transitions.insert({
          id: t.id,
          object_id: objectId,
          gnb_number: t.gnb_number,
          gnb_number_short: t.gnb_number_short,
          status: t.status || "finalized",
          address: t.address,
          project_number: t.project_number,
          title_line: t.title_line,
          object_name: t.object_name,
          executor_id: executorId,
          start_date: t.start_date ? JSON.stringify(t.start_date) : undefined,
          end_date: t.end_date ? JSON.stringify(t.end_date) : undefined,
          profile_length: t.gnb_params?.profile_length,
          plan_length: t.gnb_params?.plan_length,
          pipe_count: t.gnb_params?.pipe_count,
          drill_diameter: t.gnb_params?.drill_diameter,
          configuration: t.gnb_params?.configuration,
          pipe_mark: t.pipe?.mark,
          pipe_diameter_mm: t.pipe?.diameter_mm,
          pipe_quality_passport: t.pipe?.quality_passport,
          base_transition_id: t.base_transition_id,
        });

        // Seed transition orgs
        if (t.organizations) {
          for (const [role, org] of Object.entries(t.organizations) as [string, any][]) {
            if (!org?.id) continue;
            // Map org id to our known orgs
            let orgId = org.id;
            if (org.name?.includes("ОЭК") && !org.name?.includes("Стройтрест")) orgId = "oek";
            else if (org.name?.includes("Стройтрест")) orgId = "stroytrest";
            else if (org.name?.includes("СПЕЦИНЖСТРОЙ")) orgId = "sis";
            repos.transitionOrgs.upsert({ transition_id: t.id, role, org_id: orgId });
          }
        }

        // Seed transition signatories
        if (t.signatories) {
          for (const [key, sig] of Object.entries(t.signatories) as [string, any][]) {
            if (!sig?.person_id) continue;
            const role = key.replace("_customer", "").replace("_contractor", "").replace("_optional", "").replace("_supervisor", "");
            repos.transitionSigs.insert({
              transition_id: t.id,
              role: sig.role || role,
              person_id: sig.person_id,
              org_id: sig.org_description?.includes("ОЭК") && !sig.org_description?.includes("Стройтрест") ? "oek"
                : sig.org_description?.includes("Стройтрест") ? "stroytrest"
                : sig.org_description?.includes("СПЕЦИНЖСТРОЙ") ? "sis" : undefined,
            });
          }
        }

        stats.transitions++;
      } catch (err) {
        logger.warn({ err, file }, "Failed to migrate transition");
      }
    }
  }

  logger.info(stats, "Seed/migration complete");
  return stats;
}

function slugify(s: string): string {
  return s.toLowerCase()
    .replace(/[«»"']/g, "")
    .replace(/[^a-zа-яё0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    || "unknown";
}
