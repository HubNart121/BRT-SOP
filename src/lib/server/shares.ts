import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import type { ShareLink, SharedSop } from '@/lib/shared/types';
import { audit, canAuthorSop } from './access';
import type { AuthUser } from './auth';
import { getDb, type Queryable } from './db';
import { badRequest, conflict, forbidden, notFound, str } from './http';

export const SHARE_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const MIN_TTL_MS = 60_000;
const MAX_TTL_MS = 90 * 24 * 3600_000;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

const LINK_COLS = `l.id, l.token_hint, l.note, l.expires_at, l.created_at, l.revoked_at, l.view_count, l.last_viewed_at,
  coalesce(nullif(u.full_name, ''), u.email) as created_by_name,
  case when l.revoked_at is not null then 'revoked' when l.expires_at <= now() then 'expired' else 'active' end as status`;

async function requireSharer(q: Queryable, user: AuthUser, sopId: string, lock = false) {
  const { rows } = await q.query(
    `select id, owner_id, published_version_id from sops where id = $1${lock ? ' for update' : ''}`,
    [sopId],
  );
  const sop = rows[0];
  if (!sop) throw notFound('ไม่พบ SOP นี้');
  if (!canAuthorSop(user, sop)) throw forbidden('เฉพาะเจ้าของเอกสารหรือผู้ดูแลระบบที่แชร์ลิงก์ได้');
  return sop as { id: string; owner_id: string; published_version_id: string | null };
}

export async function listShareLinks(user: AuthUser, sopId: string): Promise<ShareLink[]> {
  const db = await getDb();
  await requireSharer(db, user, sopId);
  const { rows } = await db.query<ShareLink>(
    `select ${LINK_COLS}
       from sop_share_links l join app_users u on u.id = l.created_by
      where l.sop_id = $1
      order by (l.revoked_at is null and l.expires_at > now()) desc, l.created_at desc
      limit 50`,
    [sopId],
  );
  return rows;
}

export async function createShareLink(user: AuthUser, sopId: string, body: Record<string, unknown>) {
  const note = str(body.note, 'หมายเหตุ', { optional: true, max: 200 });
  const expiresAt = typeof body.expiresAt === 'string' ? new Date(body.expiresAt) : null;
  if (!expiresAt || Number.isNaN(expiresAt.getTime())) throw badRequest('กรุณากำหนดวันหมดอายุของลิงก์');
  const ttl = expiresAt.getTime() - Date.now();
  if (ttl < MIN_TTL_MS) throw badRequest('วันหมดอายุต้องอยู่ในอนาคต');
  if (ttl > MAX_TTL_MS) throw badRequest('ลิงก์มีอายุได้ไม่เกิน 90 วัน');

  const token = randomBytes(32).toString('base64url');
  const db = await getDb();
  return db.tx(async (q) => {
    const sop = await requireSharer(q, user, sopId, true);
    if (!sop.published_version_id) throw conflict('แชร์ได้เฉพาะ SOP ที่มีฉบับเผยแพร่แล้ว', 'NOT_PUBLISHED');
    const { rows } = await q.query(
      `insert into sop_share_links (sop_id, token_hash, token_hint, note, expires_at, created_by)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [sopId, hashToken(token), token.slice(0, 6), note, expiresAt.toISOString(), user.id],
    );
    await audit(q, {
      actor: user.id,
      sop: sopId,
      type: 'SHARE_LINK_CREATED',
      meta: { share_id: rows[0].id, expires_at: expiresAt.toISOString(), note },
    });
    const link = await q.query<ShareLink>(
      `select ${LINK_COLS} from sop_share_links l join app_users u on u.id = l.created_by where l.id = $1`,
      [rows[0].id],
    );
    // The plain token is returned only here; the database keeps its hash.
    return { link: link.rows[0], token };
  });
}

export async function revokeShareLink(user: AuthUser, sopId: string, shareId: string) {
  const db = await getDb();
  return db.tx(async (q) => {
    await requireSharer(q, user, sopId, true);
    const { rows } = await q.query(
      `update sop_share_links set revoked_at = now(), revoked_by = $3
        where id = $1 and sop_id = $2 and revoked_at is null
        returning id`,
      [shareId, sopId, user.id],
    );
    if (!rows[0]) throw notFound('ไม่พบลิงก์นี้ หรือถูกยกเลิกไปแล้ว');
    await audit(q, { actor: user.id, sop: sopId, type: 'SHARE_LINK_REVOKED', meta: { share_id: shareId } });
    return { ok: true };
  });
}

/**
 * Public read: the CURRENT published version of the shared SOP.
 * Every failure (bad / expired / revoked token, creator deactivated) is the same 404.
 */
export async function getSharedSop(token: string): Promise<SharedSop> {
  const gone = notFound('ลิงก์นี้หมดอายุ ถูกยกเลิก หรือไม่ถูกต้อง');
  if (!SHARE_TOKEN_RE.test(token)) throw gone;
  const db = await getDb();
  const { rows } = await db.query(
    `select l.id as link_id, l.expires_at, s.code, v.id as version_id, v.title, v.version_label, v.revision_no,
            v.effective_date::text as effective_date, v.content_json,
            coalesce(nullif(o.full_name, ''), 'ไม่ระบุชื่อ') as prepared_by
       from sop_share_links l
       join app_users creator on creator.id = l.created_by and creator.is_active
       join sops s on s.id = l.sop_id
       join sop_versions v on v.id = s.published_version_id and v.state = 'PUBLISHED'
       join app_users o on o.id = s.owner_id
      where l.token_hash = $1 and l.revoked_at is null and l.expires_at > now()`,
    [hashToken(token)],
  );
  const r = rows[0];
  if (!r) throw gone;

  await db.query(`update sop_share_links set view_count = view_count + 1, last_viewed_at = now() where id = $1`, [
    r.link_id,
  ]);
  const diagrams = await db.query(`select block_id, preview_png_data from sop_diagrams where version_id = $1`, [
    r.version_id,
  ]);
  const steps = await db.query(
    `select st.step_no, st.decided_at, coalesce(nullif(u.full_name, ''), 'ไม่ระบุชื่อ') as name
       from approval_steps st join app_users u on u.id = st.decided_by
      where st.version_id = $1 and st.state = 'APPROVED'
      order by st.attempt_no desc`,
    [r.version_id],
  );
  const step = (no: number) => {
    const s = steps.rows.find((x) => x.step_no === no);
    return s ? { name: s.name as string, at: s.decided_at as string | null } : null;
  };

  return {
    code: r.code,
    title: r.title,
    version_label: r.version_label,
    revision_no: r.revision_no,
    effective_date: r.effective_date,
    content_json: r.content_json,
    diagrams: diagrams.rows,
    prepared_by: r.prepared_by,
    reviewed: step(1),
    approved: step(2),
    expires_at: r.expires_at,
  };
}
