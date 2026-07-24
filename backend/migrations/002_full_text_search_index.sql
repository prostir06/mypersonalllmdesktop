-- Migration: 002_full_text_search_index.sql
-- Додає індекс для повнотекстового пошуку по повідомленнях

CREATE INDEX IF NOT EXISTS idx_messages_content_search
  ON messages USING gin(to_tsvector('simple', content));
