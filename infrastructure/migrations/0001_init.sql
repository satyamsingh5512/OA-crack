-- 0001_init.sql
-- Schema of record for the AI Interview Assistant backend.
-- Applied by `npm run migrate -w apps/backend` (see src/db/migrate.ts).
-- Never edit an applied migration: add a new numbered file instead.

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists refresh_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists refresh_tokens_user_idx on refresh_tokens (user_id);

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  mode text not null,
  status text not null default 'active',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  score real,
  resume_id uuid,
  job_description_id uuid
);
create index if not exists sessions_user_started_idx on sessions (user_id, started_at desc);
-- Only one active session per user (also enforced in application logic).
create unique index if not exists sessions_one_active_per_user_idx on sessions (user_id) where status = 'active';

create table if not exists transcripts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  speaker text not null,
  text text not null,
  "timestamp" timestamptz not null default now(),
  confidence real
);
create index if not exists transcripts_session_idx on transcripts (session_id, "timestamp");

create table if not exists transcript_segments (
  id uuid primary key default gen_random_uuid(),
  transcript_id uuid not null references transcripts(id) on delete cascade,
  start_ms integer not null,
  end_ms integer not null,
  text text not null
);
create index if not exists transcript_segments_transcript_idx on transcript_segments (transcript_id);

create table if not exists questions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  text text not null,
  category text not null,
  confidence real not null default 0,
  context text not null default '',
  detected_at timestamptz not null default now()
);
create index if not exists questions_session_category_idx on questions (session_id, category);

create table if not exists answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null unique references questions(id) on delete cascade,
  text text not null,
  key_points text[] not null default '{}',
  latency_ms integer not null default 0,
  provider text not null default 'unknown',
  created_at timestamptz not null default now()
);

create table if not exists evaluations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references sessions(id) on delete cascade,
  overall_score real not null,
  categories_json jsonb not null default '{}'::jsonb,
  top_improvements text[] not null default '{}',
  next_practice text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  filename text not null,
  content text not null default '',
  parsed_json jsonb not null default '{}'::jsonb,
  uploaded_at timestamptz not null default now()
);
create index if not exists resumes_user_idx on resumes (user_id, uploaded_at desc);

create table if not exists job_descriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  content text not null,
  parsed_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists job_descriptions_user_idx on job_descriptions (user_id, created_at desc);

create table if not exists ai_providers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  provider text not null,
  encrypted_api_key text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, provider)
);

create table if not exists usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists usage_events_user_created_idx on usage_events (user_id, created_at desc);

create table if not exists user_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references users(id) on delete cascade,
  settings_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists privacy_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references users(id) on delete cascade,
  mic_enabled boolean not null default true,
  system_audio_enabled boolean not null default false,
  screen_enabled boolean not null default false,
  cloud_ai boolean not null default true,
  cloud_transcription boolean not null default true,
  session_recording boolean not null default false,
  retention_days integer not null default 7,
  updated_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  action text not null,
  resource text not null default '',
  ip_address text,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_user_created_idx on audit_logs (user_id, created_at desc);