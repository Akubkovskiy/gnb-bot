/**
 * Storage plan builder — plans file layout for a GNB transition package.
 *
 * Default: OEK layout.
 * No actual filesystem writes — only planning.
 */

import type { StoragePlan, StoragePlanEntry, RegistryDocument, DocumentKind } from "./document-registry-types.js";

// === Folder definitions (OEK default) ===

interface FolderDef {
  folder: string;
  label: string;
  kinds: DocumentKind[];
}

const OEK_FOLDERS: FolderDef[] = [
  { folder: "01 ИС", label: "Исполнительные схемы", kinds: ["executive_scheme"] },
  { folder: "02 Паспорта трубы", label: "Паспорта и сертификаты трубы", kinds: ["pipe_passport", "pipe_certificate"] },
  { folder: "03 Материалы", label: "Материалы (бентонит, УКПТ, заглушки, шнур)", kinds: ["bentonite_passport", "ukpt_doc", "plugs_doc", "cord_doc"] },
  { folder: "04 Приказы", label: "Приказы и распоряжения", kinds: ["order_sign1", "order_sign2", "order_sign3", "order_tech", "appointment_letter"] },
  { folder: "05 Исполнительная документация", label: "Сформированные акты", kinds: ["generated_internal_acts", "generated_aosr"] },
  { folder: "06 Прочее", label: "Прочие документы", kinds: ["prior_internal_act", "prior_aosr", "summary_excel", "photo", "free_text_note", "other"] },
];

// === Plan builder ===

/**
 * Build a storage plan for a transition.
 *
 * @param customer - customer name
 * @param object - object name
 * @param gnbShort - short GNB number (e.g. "5-5")
 * @param registryDocs - documents to place
 */
export function buildStoragePlan(
  customer: string,
  object: string,
  gnbShort: string,
  registryDocs: RegistryDocument[],
): StoragePlan {
  const basePath = `${customer}/${object}/ЗП ${gnbShort}`;
  const folders: StoragePlanEntry[] = [];

  for (const folderDef of OEK_FOLDERS) {
    const matching = registryDocs.filter((d) => folderDef.kinds.includes(d.kind));
    folders.push({
      folder: folderDef.folder,
      label: folderDef.label,
      documents: matching.map((d) => ({
        doc_id: d.doc_id,
        file_name: d.approved_name || d.name_proposal?.suggested_name || d.original_file_name || "unnamed",
        kind: d.kind,
      })),
    });
  }

  return { base_path: basePath, folders };
}

/**
 * Suggest target folder for a single document kind.
 */
export function suggestDocumentTargetFolder(kind: DocumentKind): string {
  const match = OEK_FOLDERS.find((f) => f.kinds.includes(kind));
  return match?.folder ?? "06 Прочее";
}

/**
 * Suggest folder for generated files.
 */
export function suggestGeneratedFilesFolder(): string {
  return "05 Исполнительная документация";
}
