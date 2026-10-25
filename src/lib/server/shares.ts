import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import type { ShareLink, ShareStatus, SharedSop } from '@/lib/shared/types';
import { audit, canAuthorSop } from './access';
import type { AuthUser } from './auth';
import { C, data, getDb, iso, newId, now, type DiagramDoc, type SopDoc, type StepDoc, type UserDoc, type VersionDoc } from './db';
import { badRequest, conflict, forbidden, notFound, str } from './http';

export const SHARE_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const MIN_TTL_MS = 60_000;
const MAX_TTL_MS = 90 * 24 * 3600_000;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

interface ShareDoc {
  sop_id: string;
  token_hash: string;
  token_hint: string;
  note: string;
  expires_at: Timestamp;
  created_by: string;
  created_at: Timestamp;
  revoked_at: Timestamp | null;
  revoked_by: string | null;
  view_count: number;
  last_viewed_at: Timestamp | null;
}

function status(s: ShareDoc): ShareStatus {
  if (s.revoked_at) return 'revoked';
  return s.expires_at.toMillis() <= Date.now() ? 'expired' : 'active';
}

const linkOut = (id: string, s: ShareDoc, createdBy: string): ShareLink => ({
  id,
  token_hint: s.token_hint,
  note: s.note,
  status: status(s),
  expires_at: iso(s.expires_at)!,
  created_at: iso(s.created_at)!,
  created_by_name: createdBy,
  revoked_at: iso(s.revoked_at),
  view_count: s.view_count,
  last_viewed_at: iso(s.last_viewed_at),
});

async function requireSharer(db: Firestore, user: AuthUser, sopId: string) {
  const sop = data<SopDoc>(await db.collection(C.sops).doc(sopId).get());
  if (!sop) throw notFound('ไม่พบ SOP นี้');
  if (!canAuthorSop(user, sop)) throw forbidden('เฉพาะเจ้าของเอกสารหรือผู้ดูแลระบบที่แชร์ลิงก์ได้');
  return sop;
}

/** Display names. `publicView` never falls back to the e-mail address (share pages are public). */
async function creatorNames(db: Firestore, ids: string[], publicView = false): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map();
  const snaps = await db.getAll(...unique.map((id) => db.collection(C.users).doc(id)));
  return new Map(
    snaps.map((s) => {
      const u = s.data() as UserDoc | undefined;
      return [s.id, u?.full_name || (publicView ? 'ไม่ระบุชื่อ' : u?.email) || '—'];
    }),
  );
}

export async function listShareLinks(user: AuthUser, sopId: string): Promise<ShareLink[]> {
  const db = await getDb();
  await requireSharer(db, user, sopId);
  const snap = await db.collection(C.shares).where('sop_id', '==', sopId).get();
  const links = snap.docs.map((d) => ({ id: d.id, s: d.data() as ShareDoc }));
  const names = await creatorNames(db, links.map((l) => l.s.created_by));
  return links
    .map((l) => linkOut(l.id, l.s, names.get(l.s.created_by) ?? '—'))
    .sort(
      (a, b) =>
        Number(b.status === 'active') - Number(a.status === 'active') || b.created_at.localeCompare(a.created_at),
    )
    .slice(0, 50);
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
  const id = newId();
  const link = await db.runTransaction(async (t) => {
    const sop = data<SopDoc>(await t.get(db.collection(C.sops).doc(sopId)));
    if (!sop) throw notFound('ไม่พบ SOP นี้');
    if (!canAuthorSop(user, sop)) throw forbidden('เฉพาะเจ้าของเอกสารหรือผู้ดูแลระบบที่แชร์ลิงก์ได้');
    if (!sop.published_version_id) throw conflict('แชร์ได้เฉพาะ SOP ที่มีฉบับเผยแพร่แล้ว', 'NOT_PUBLISHED');
    const doc: ShareDoc = {
      sop_id: sopId,
      token_hash: hashToken(token),
      token_hint: token.slice(0, 6),
      note,
      expires_at: Timestamp.fromDate(expiresAt),
      created_by: user.id,
      created_at: now(),
      revoked_at: null,
      revoked_by: null,
      view_count: 0,
      last_viewed_at: null,
    };
    t.create(db.collection(C.shares).doc(id), doc);
    audit(db, t, {
      actor: user.id,
      sop: sopId,
      type: 'SHARE_LINK_CREATED',
      meta: { share_id: id, expires_at: expiresAt.toISOString(), note },
    });
    return linkOut(id, doc, user.full_name || user.email);
  });
  // The plain token is returned only here; Firestore keeps its hash.
  return { link, token };
}

export async function revokeShareLink(user: AuthUser, sopId: string, shareId: string) {
  const db = await getDb();
  return db.runTransaction(async (t) => {
    const ref = db.collection(C.shares).doc(shareId);
    const [sopSnap, linkSnap] = await t.getAll(db.collection(C.sops).doc(sopId), ref);
    const sop = data<SopDoc>(sopSnap);
    if (!sop) throw notFound('ไม่พบ SOP นี้');
    if (!canAuthorSop(user, sop)) throw forbidden('เฉพาะเจ้าของเอกสารหรือผู้ดูแลระบบที่แชร์ลิงก์ได้');
    const link = data<ShareDoc>(linkSnap);
    if (!link || link.sop_id !== sopId || link.revoked_at) throw notFound('ไม่พบลิงก์นี้ หรือถูกยกเลิกไปแล้ว');
    t.update(ref, { revoked_at: now(), revoked_by: user.id });
    audit(db, t, { actor: user.id, sop: sopId, type: 'SHARE_LINK_REVOKED', meta: { share_id: shareId } });
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
  const snap = await db.collection(C.shares).where('token_hash', '==', hashToken(token)).limit(1).get();
  const linkDoc = snap.docs[0];
  if (!linkDoc) throw gone;
  const link = linkDoc.data() as ShareDoc;
  if (link.revoked_at || link.expires_at.toMillis() <= Date.now()) throw gone;

  const [creatorSnap, sopSnap] = await db.getAll(
    db.collection(C.users).doc(link.created_by),
    db.collection(C.sops).doc(link.sop_id),
  );
  const creator = data<UserDoc>(creatorSnap);
  const sop = data<SopDoc>(sopSnap);
  if (!creator?.is_active || !sop?.published_version_id) throw gone;
  const vRef = db.collection(C.sops).doc(link.sop_id).collection(C.versions).doc(sop.published_version_id);
  const [vSnap, diagrams, steps, owner] = await Promise.all([
    vRef.get(),
    vRef.collection(C.diagrams).get(),
    db.collection(C.steps).where('version_id', '==', sop.published_version_id).get(),
    db.collection(C.users).doc(sop.owner_id).get(),
  ]);
  const v = data<VersionDoc>(vSnap);
  if (!v || v.state !== 'PUBLISHED') throw gone;

  await linkDoc.ref.update({ view_count: FieldValue.increment(1), last_viewed_at: now() });

  const approved = steps.docs
    .map((d) => d.data() as StepDoc)
    .filter((s) => s.state === 'APPROVED')
    .sort((a, b) => b.attempt_no - a.attempt_no);
  const deciders = await creatorNames(db, approved.map((s) => s.decided_by!).filter(Boolean), true);
  const step = (no: number) => {
    const s = approved.find((x) => x.step_no === no);
    return s ? { name: deciders.get(s.decided_by!) || 'ไม่ระบุชื่อ', at: iso(s.decided_at) } : null;
  };

  return {
    code: sop.code,
    title: v.title,
    version_label: v.version_label!,
    revision_no: v.revision_no,
    effective_date: v.effective_date,
    content_json: JSON.parse(v.content_json),
    diagrams: diagrams.docs.map((d) => ({ block_id: d.id, preview_png_data: (d.data() as DiagramDoc).preview_png_data })),
    prepared_by: (owner.get('full_name') as string) || 'ไม่ระบุชื่อ',
    reviewed: step(1),
    approved: step(2),
    expires_at: iso(link.expires_at)!,
  };
}
