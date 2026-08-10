-- P23: unify embeddings to 768 dim (OpenAI matryoshka + Ollama nomic-embed-text)
DROP INDEX IF EXISTS idx_document_chunks_embedding_hnsw;
UPDATE document_chunks SET embedding = NULL;
UPDATE documents SET embeddings_count = 0;
ALTER TABLE document_chunks ALTER COLUMN embedding TYPE vector(768) USING NULL;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS embedding_provider VARCHAR(20);
CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding_hnsw
  ON document_chunks USING hnsw (embedding vector_cosine_ops);
