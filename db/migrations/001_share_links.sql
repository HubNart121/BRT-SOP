-- 001 — Public share links (2026-10-25)
-- For databases created from an older db/schema.sql. Safe to run more than once.
--   node scripts/db-apply.mjs db/migrations/001_share_links.sql

create table if not exists sop_share_links (
  id             uuid primary key default gen_random_uuid(),
  sop_id         uuid not null references sops (id) on delete cascade,
  token_hash     text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  token_hint     text not null,
  note           text not null default '',
  expires_at     timestamptz not null,
  created_by     uuid not null references app_users (id),
  created_at     timestamptz not null default now(),
  revoked_at     timestamptz,
  revoked_by     uuid references app_users (id),
  view_count     int not null default 0,
  last_viewed_at timestamptz,
  check (expires_at > created_at),
  check (expires_at <= created_at + interval '90 days 1 hour')
);
create index if not exists sop_share_links_sop on sop_share_links (sop_id, created_at desc);
