/**
 * Knowledge ingest flow — save standalone documents into DB.
 *
 * Scenario: owner uploads a document outside active draft (or says "save data").
 * Flow: extract → classify → find links in DB → ask owner if ambiguous → persist.
 *
 * This is CODE orchestration. Claude skill reasons, code persists.
 */

import type { KnowledgeIngestInput, KnowledgeIngestOutput, IngestDocKind } from "./reasoning-contracts.js";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "./schema.js";
import { createRepos } from "./repositories.js";
import { logger } from "../logger.js";

type Db = BetterSQLite3Database<typeof schema>;
type ClaudeCaller = (prompt: string, opts?: { systemPrompt?: string }) => Promise<string>;

/**
 * Process a standalone document for knowledge base ingestion.
 *
 * 1. Build context from DB (matching people, materials, objects)
 * 2. Call Claude with ingest skill prompt
 * 3. Parse structured output
 * 4. If links are clear → persist immediately
 * 5. If links are missing → return questions for owner
 */
export async function processKnowledgeIngest(
  db: Db,
  extractedData: Record<string, unknown>,
  docClass: string,
  fileName: string,
  callClaude: ClaudeCaller,
): Promise<KnowledgeIngestOutput | null> {
  const repos = createRepos(db);

  // Build context from DB
  const allPeople = repos.people.getAll().map((p) => ({
    personId: p.id,
    fullName: p.full_name,
    org: p.org_id ? repos.orgs.getById(p.org_id)?.short_name : undefined,
  }));

  const allMaterials = repos.materials.getAll().map((m) => ({
    materialId: m.id,
    name: m.name,
    type: m.material_type,
  }));

  const allObjects = repos.customers.getAll().flatMap((c) =>
    repos.objects.getByCustomerId(c.id).map((o) => ({
      objectId: o.id,
      shortName: o.short_name,
      customerName: c.name,
    })),
  );

  const input: KnowledgeIngestInput = {
    extractedData,
    docClass,
    fileName,
    matchedPeople: allPeople,
    matchedMaterials: allMaterials,
    knownObjects: allObjects,
  };

  // Call Claude
  const prompt = buildIngestPrompt(input);
  let rawResponse: string;
  try {
    rawResponse = await callClaude(prompt);
  } catch (err) {
    logger.error({ err }, "Knowledge ingest Claude call failed");
    return null;
  }

  return parseIngestOutput(rawResponse);
}

/**
 * Persist a resolved ingest result into SQLite.
 * Called after all links are resolved (no missing links).
 */
export function persistIngestResult(
  db: Db,
  result: KnowledgeIngestOutput,
  filePath?: string,
): { documentId: string; persisted: boolean } {
  const repos = createRepos(db);
  const docId = `ingest-${Date.now()}`;

  // Determine doc_type from ingest result
  const docType = mapKindToDocType(result.docKind, result.extractedData);

  // Create document
  repos.documents.insert({
    id: docId,
    doc_type: docType,
    original_filename: result.extractedData.fileName as string ?? undefined,
    doc_number: result.extractedData.docNumber as string ?? undefined,
    doc_date: result.extractedData.docDate as string ?? undefined,
    file_path: filePath,
    extracted_summary: result.summary,
    confidence: "high",
    status: "approved",
    origin: "manual",
  });

  // Create links
  if (result.suggestedLinks.personId) {
    repos.documentLinks.insert({
      document_id: docId,
      link_type: "person",
      target_id: result.suggestedLinks.personId,
      relation: docType === "order" ? "order" : "related",
    });

    // If it's a person document (order/appointment), also create person_document entry
    if (result.docKind === "person_document") {
      repos.personDocs.insert({
        person_id: result.suggestedLinks.personId,
        doc_type: (result.extractedData.docType as string) ?? "приказ",
        doc_number: (result.extractedData.docNumber as string) ?? undefined,
        doc_date: (result.extractedData.docDate as string) ?? undefined,
        role_granted: (result.extractedData.role as string) ?? undefined,
        is_current: 1,
      });
    }
  }

  if (result.suggestedLinks.materialId) {
    repos.documentLinks.insert({
      document_id: docId,
      link_type: "material",
      target_id: result.suggestedLinks.materialId,
      relation: "passport",
    });
  }

  if (result.suggestedLinks.objectId) {
    repos.documentLinks.insert({
      document_id: docId,
      link_type: "object",
      target_id: result.suggestedLinks.objectId,
      relation: "source",
    });
  }

  if (result.suggestedLinks.transitionId) {
    repos.documentLinks.insert({
      document_id: docId,
      link_type: "transition",
      target_id: result.suggestedLinks.transitionId,
      relation: "source",
    });
  }

  logger.info({ docId, docKind: result.docKind, links: result.suggestedLinks }, "Knowledge ingested");
  return { documentId: docId, persisted: true };
}

// === Prompt builder ===

function buildIngestPrompt(input: KnowledgeIngestInput): string {
  return `Ты — GNB knowledge ingest engine. Классифицируй документ и определи связи для сохранения в базу.

ФАЙЛ: ${input.fileName}
ТИП ДОКУМЕНТА: ${input.docClass}

ИЗВЛЕЧЁННЫЕ ДАННЫЕ:
${JSON.stringify(input.extractedData, null, 2)}

ЛЮДИ В БАЗЕ:
${input.matchedPeople.map((p) => `- ${p.personId}: ${p.fullName} (${p.org ?? ""})`).join("\n") || "пусто"}

МАТЕРИАЛЫ В БАЗЕ:
${input.matchedMaterials.map((m) => `- ${m.materialId}: ${m.name} (${m.type})`).join("\n") || "пусто"}

ОБЪЕКТЫ В БАЗЕ:
${input.knownObjects.map((o) => `- ${o.objectId}: ${o.shortName} (${o.customerName})`).join("\n") || "пусто"}

ЗАДАЧА:
1. Определи docKind: person_document, pipe_document, material_document, scheme, reference_act, organization_document, unknown
2. Определи suggestedLinks: personId, objectId, materialId, transitionId (из списков выше, или null)
3. Если связь неочевидна — добавь вопрос в questionsForOwner
4. НЕ выдумывай ID, которых нет в списках

ФОРМАТ ОТВЕТА (только JSON):
{
  "docKind": "...",
  "extractedData": { ... },
  "suggestedLinks": { "personId": "...", "objectId": null, "materialId": null, "transitionId": null },
  "missingLinks": [],
  "questionsForOwner": [],
  "summary": "..."
}`;
}

// === Output parsing ===

function parseIngestOutput(raw: string): KnowledgeIngestOutput | null {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    logger.warn({ raw: raw.slice(0, 200) }, "Could not find JSON in ingest output");
    return null;
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.docKind || !parsed.summary) return null;

    return {
      docKind: parsed.docKind as IngestDocKind,
      extractedData: parsed.extractedData ?? {},
      suggestedLinks: {
        personId: parsed.suggestedLinks?.personId ?? null,
        objectId: parsed.suggestedLinks?.objectId ?? null,
        materialId: parsed.suggestedLinks?.materialId ?? null,
        transitionId: parsed.suggestedLinks?.transitionId ?? null,
      },
      missingLinks: parsed.missingLinks ?? [],
      questionsForOwner: parsed.questionsForOwner ?? [],
      summary: String(parsed.summary),
    };
  } catch (err) {
    logger.warn({ err }, "Failed to parse ingest output");
    return null;
  }
}

function mapKindToDocType(kind: IngestDocKind, data: Record<string, unknown>): string {
  switch (kind) {
    case "person_document": return (data.docType as string) ?? "order";
    case "pipe_document": return "pipe_passport";
    case "material_document": return "material_doc";
    case "scheme": return "executive_scheme";
    case "reference_act": return "prior_act";
    case "organization_document": return "organization_doc";
    default: return "unknown";
  }
}
