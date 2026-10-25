-- ═══════════════════════════════════════════════════════════════════════
-- BRT SOP Center — initial PostgreSQL schema (PostgreSQL 14+)
--
-- Run ONCE on an empty database:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/schema.sql
--   (or: npm run db:schema)
-- This is an initial schema, not a migration. After go-live, use versioned
-- migrations and take a backup before changing the structure.
-- ═══════════════════════════════════════════════════════════════════════

create extension if not exists pg_trgm;

-- ── Users ──────────────────────────────────────────────────────────────
create table app_users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null check (email = lower(email) and position('@' in email) > 1),
  firebase_uid  text unique,
  full_name     text not null default '',
  role          text not null default 'VIEWER'
                check (role in ('ADMIN', 'AUTHOR', 'REVIEWER', 'APPROVER', 'VIEWER')),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  last_login_at timestamptz
);
create unique index app_users_email_key on app_users (email);

-- ── Categories ─────────────────────────────────────────────────────────
create table sop_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(name) between 1 and 80),
  slug       text not null check (slug ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  parent_id  uuid references sop_categories (id) on delete restrict,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create unique index sop_categories_slug_key on sop_categories (slug);

-- ── SOP identity (permanent) ───────────────────────────────────────────
create table sops (
  id                   uuid primary key default gen_random_uuid(),
  code                 text not null check (code ~ '^[A-Z0-9][A-Z0-9-]{1,39}$'),
  title                text not null,
  owner_id             uuid not null references app_users (id),
  published_version_id uuid,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create unique index sops_code_key on sops (code);
create index sops_title_trgm on sops using gin (title gin_trgm_ops);
create index sops_code_trgm on sops using gin (code gin_trgm_ops);

create table sop_category_links (
  sop_id      uuid not null references sops (id) on delete cascade,
  category_id uuid not null references sop_categories (id) on delete restrict,
  primary key (sop_id, category_id)
);
create index sop_category_links_category on sop_category_links (category_id);

-- ── SOP versions (content per revision) ────────────────────────────────
create table sop_versions (
  id                  uuid primary key default gen_random_uuid(),
  sop_id              uuid not null references sops (id) on delete cascade,
  revision_no         int not null check (revision_no > 0),
  version_label       text check (version_label ~ '^[0-9]+\.[0-9]+$'),
  state               text not null default 'DRAFT'
                      check (state in ('DRAFT', 'IN_REVIEW', 'IN_APPROVAL', 'PUBLISHED', 'SUPERSEDED')),
  title               text not null check (length(title) between 1 and 200),
  content_json        jsonb not null default '{"type":"doc","content":[]}',
  content_text        text not null default '',
  change_note         text not null default '',
  major_change        boolean not null default false,
  based_on_version_id uuid references sop_versions (id),
  row_version         int not null default 1,
  created_by          uuid not null references app_users (id),
  updated_by          uuid references app_users (id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  submitted_at        timestamptz,
  published_at        timestamptz,
  published_by        uuid references app_users (id),
  effective_date      date,
  superseded_at       timestamptz,
  unique (sop_id, revision_no),
  unique (sop_id, id),
  check ((state in ('PUBLISHED', 'SUPERSEDED')) = (version_label is not null and published_at is not null))
);
-- At most one working version (Draft / In Review / In Approval) per SOP
create unique index sop_versions_one_active on sop_versions (sop_id)
  where state in ('DRAFT', 'IN_REVIEW', 'IN_APPROVAL');
-- At most one published version per SOP
create unique index sop_versions_one_published on sop_versions (sop_id) where state = 'PUBLISHED';
create unique index sop_versions_label_key on sop_versions (sop_id, version_label) where version_label is not null;
create index sop_versions_text_trgm on sop_versions using gin (content_text gin_trgm_ops);

-- sops.published_version_id must point to a revision of the SAME SOP
alter table sops
  add constraint sops_published_version_fk
  foreign key (id, published_version_id) references sop_versions (sop_id, id);

-- Published / superseded content is immutable; state can only move forward.
create function sop_versions_guard() returns trigger language plpgsql as $$
begin
  if old.state in ('PUBLISHED', 'SUPERSEDED') then
    if new.content_json is distinct from old.content_json
       or new.content_text is distinct from old.content_text
       or new.title is distinct from old.title
       or new.version_label is distinct from old.version_label
       or new.revision_no is distinct from old.revision_no
       or new.sop_id is distinct from old.sop_id
       or new.published_at is distinct from old.published_at then
      raise exception 'sop_versions: published content is immutable (version %)', old.id;
    end if;
    if old.state = 'SUPERSEDED' and new.state <> 'SUPERSEDED' then
      raise exception 'sop_versions: superseded version cannot change state (version %)', old.id;
    end if;
    if old.state = 'PUBLISHED' and new.state not in ('PUBLISHED', 'SUPERSEDED') then
      raise exception 'sop_versions: published version can only become superseded (version %)', old.id;
    end if;
  end if;
  return new;
end;
$$;
create trigger sop_versions_guard before update on sop_versions
  for each row execute function sop_versions_guard();

-- ── draw.io diagrams (bound to a version) ──────────────────────────────
create table sop_diagrams (
  id               uuid primary key default gen_random_uuid(),
  version_id       uuid not null references sop_versions (id) on delete cascade,
  block_id         text not null check (block_id ~ '^[A-Za-z0-9_-]{6,64}$'),
  xml_source       text not null,
  preview_png_data text check (preview_png_data is null or preview_png_data like 'data:image/png;base64,%'),
  updated_by       uuid references app_users (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (version_id, block_id)
);

-- Diagrams may only change while their version is a draft.
create function sop_diagrams_guard() returns trigger language plpgsql as $$
declare
  v_state text;
begin
  if tg_op = 'DELETE' then
    select state into v_state from sop_versions where id = old.version_id;
    if v_state is not null and v_state <> 'DRAFT' then
      raise exception 'sop_diagrams: version % is not a draft', old.version_id;
    end if;
    return old;
  end if;
  select state into v_state from sop_versions where id = new.version_id;
  if v_state is distinct from 'DRAFT' then
    raise exception 'sop_diagrams: version % is not a draft', new.version_id;
  end if;
  return new;
end;
$$;
create trigger sop_diagrams_guard before insert or update or delete on sop_diagrams
  for each row execute function sop_diagrams_guard();

-- ── Attachments (metadata; files in Cloud Storage — next phase) ────────
create table sop_attachments (
  id          uuid primary key default gen_random_uuid(),
  version_id  uuid not null references sop_versions (id) on delete cascade,
  filename    text not null,
  storage_key text not null,
  mime_type   text,
  size_bytes  bigint,
  uploaded_by uuid references app_users (id),
  created_at  timestamptz not null default now()
);

-- ── Approval workflow ──────────────────────────────────────────────────
-- Each submission is an attempt; step 1 = REVIEW, step 2 = APPROVE.
create table approval_steps (
  id          uuid primary key default gen_random_uuid(),
  version_id  uuid not null references sop_versions (id) on delete cascade,
  attempt_no  int not null check (attempt_no > 0),
  step_no     int not null check (step_no in (1, 2)),
  step_type   text not null check (step_type in ('REVIEW', 'APPROVE')),
  assignee_id uuid not null references app_users (id),
  state       text not null check (state in ('WAITING', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  comment     text not null default '',
  decided_by  uuid references app_users (id),
  decided_at  timestamptz,
  created_at  timestamptz not null default now(),
  unique (version_id, attempt_no, step_no),
  check ((step_no = 1) = (step_type = 'REVIEW')),
  check (state <> 'REJECTED' or length(trim(comment)) > 0)
);
create index approval_steps_assignee_pending on approval_steps (assignee_id) where state = 'PENDING';
create index approval_steps_version on approval_steps (version_id);

-- ── Public share links (view the published version without login) ─────
-- Only a SHA-256 hash of the token is stored; the link itself is shown once at creation.
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

-- ── Audit trail (append-only) ──────────────────────────────────────────
create table audit_events (
  id         bigint generated always as identity primary key,
  actor_id   uuid references app_users (id),
  sop_id     uuid references sops (id),
  version_id uuid references sop_versions (id),
  event_type text not null,
  metadata   jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_events_sop on audit_events (sop_id, created_at desc);

create function audit_events_append_only() returns trigger language plpgsql as $$
begin
  raise exception 'audit_events is append-only';
end;
$$;
create trigger audit_events_append_only before update or delete on audit_events
  for each row execute function audit_events_append_only();

-- ── Initial categories ─────────────────────────────────────────────────
insert into sop_categories (name, slug, sort_order) values
  ('ฝ่ายขาย', 'sales', 10),
  ('จัดซื้อ', 'purchasing', 20),
  ('คลังสินค้า', 'warehouse', 30),
  ('นำเข้า', 'import', 40)
on conflict do nothing;
