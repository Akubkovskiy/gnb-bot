-- Add GDrive sync fields to documents table
ALTER TABLE documents ADD COLUMN gdrive_file_id TEXT;
ALTER TABLE documents ADD COLUMN gdrive_synced_at TEXT;

-- Unique index for document deduplication (operating principle #3)
CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_unique_file
  ON documents(doc_type, original_filename, doc_number)
  WHERE doc_number IS NOT NULL;
