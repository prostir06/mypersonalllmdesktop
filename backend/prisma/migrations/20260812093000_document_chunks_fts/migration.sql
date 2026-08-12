-- P32: FTS index for hybrid RAG retrieval on document chunks
ALTER TABLE document_chunks
  ADD COLUMN IF NOT EXISTS content_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED;

CREATE INDEX IF NOT EXISTS idx_document_chunks_content_tsv
  ON document_chunks
  USING gin (content_tsv);
