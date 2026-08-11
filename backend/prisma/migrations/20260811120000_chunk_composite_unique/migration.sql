-- P30: composite unique on (document_id, chunk_index)
CREATE UNIQUE INDEX IF NOT EXISTS "uq_document_chunks_doc_chunk"
  ON "document_chunks" ("document_id", "chunk_index");
