-- 0002_ai_provider_options.sql
-- Stores non-secret provider options alongside the encrypted key so a user can
-- point the assistant at a self-hosted / OpenAI-compatible endpoint (§3.4).

alter table ai_providers add column if not exists base_url text;
alter table ai_providers add column if not exists model text;