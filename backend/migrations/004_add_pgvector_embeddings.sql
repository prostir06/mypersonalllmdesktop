-- Migration 004: Add pgvector extension and embedding column for real RAG
-- This migration enables semantic search in document chunks via cosine similarity.
--
-- REQUIREMENT: pgvector extension must be installed in PostgreSQL.
-- Installation: https://github.com/pgvector/pgvector
-- For Docker: use pgvector/pgvector image (see docker-compose.yml)

-- 1. Enable the pgvector extension (requires superuser or rds_superuser on AWS RDS)
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Add embedding column to document_chunks (1536 dims = OpenAI text-embedding-3-small)
ALTER TABLE document_chunks
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- 3. Create HNSW index for fast approximate nearest-neighbor search (pgvector >= 0.5.0)
--    HNSW is faster for querying than IVFFlat and doesn't require a training phase.
CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding_hnsw
  ON document_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 4. Add index on document_id for fast filtering by document
CREATE INDEX IF NOT EXISTS idx_document_chunks_doc_id_embed
  ON document_chunks(document_id);
