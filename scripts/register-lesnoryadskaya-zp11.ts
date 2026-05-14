import { getDb, getRawDb } from "../src/db/client.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MEMORY_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "../.gnb-memory");
getDb(MEMORY_DIR);
const db = getRawDb()!;

const BASE = "C:\\Users\\kubko\\YandexDisk\\Работа\\СКМ Групп\\Леснорядская\\ЗП 11";

db.prepare(`
  INSERT OR IGNORE INTO transitions
    (id, object_id, gnb_number, gnb_number_short, status, object_name, created_at, updated_at)
  VALUES ('trans-lesnoryadskaya-11','obj-lesnoryadskaya','ГНБ №11','11','draft','Леснорядская',datetime('now'),datetime('now'))
`).run();

const docs = [
  { id: "doc_lesno11_is", type: "executive_scheme",  name: "Леснорядская ГНБ №11.dwg",    fp: BASE + "\\05. Исполнительные схемы\\Леснорядская ГНБ №11.dwg" },
  { id: "doc_lesno11_pb", type: "drilling_protocol", name: "Леснрядская ПБ ГНБ №11.xlsx", fp: BASE + "\\01. Исполнительная документация\\Леснрядская ПБ ГНБ №11.xlsx" },
];

for (const d of docs) {
  db.prepare(`
    INSERT OR IGNORE INTO documents
      (id, doc_type, original_filename, file_path, status, origin, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'stored', 'local_copy', datetime('now'), datetime('now'))
  `).run(d.id, d.type, d.name, d.fp);
  db.prepare(`
    INSERT OR IGNORE INTO document_links
      (document_id, link_type, target_id, relation, created_at)
    VALUES (?, 'transition', 'trans-lesnoryadskaya-11', ?, datetime('now'))
  `).run(d.id, d.type);
  console.log("✓", d.name, "→", d.type);
}

const t = db.prepare("SELECT id, status, gnb_number FROM transitions WHERE id='trans-lesnoryadskaya-11'").get() as any;
const linked = db.prepare(`
  SELECT d.doc_type, d.original_filename, d.file_path
  FROM documents d
  JOIN document_links dl ON dl.document_id = d.id
  WHERE dl.target_id = 'trans-lesnoryadskaya-11'
`).all() as any[];

console.log(`\nПереход: ${t.gnb_number} (${t.status})`);
for (const d of linked) console.log(`  📄 ${d.doc_type}: ${d.original_filename}`);
console.log("\n✅ Готово");
