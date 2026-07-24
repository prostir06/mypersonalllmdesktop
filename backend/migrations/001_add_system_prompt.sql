-- Migration: 001_add_system_prompt.sql
-- Додає підтримку system_prompt у user_settings

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS system_prompt TEXT DEFAULT '';
