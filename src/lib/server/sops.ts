import 'server-only';
import { FieldPath, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { BLOCK_ID_RE, MAX_DOC_BYTES, diagramIds, docToText, sanitizeDoc, sopTemplate } from '@/lib/shared/content';
import type {
  ApprovalStep,
  ApprovalTask,
  AuditEvent,
  DashboardData,
  Diagram,
  SopDetail,
  SopListItem,
  TiptapDoc,
  UserRef,
  VersionDetail,
  VersionState,
  VersionSummary,
} from '@/lib/shared/types';
import {
  APPROVER_ROLES,
  REVIEWER_ROLES,
  assignedVersionIds,
  audit,
  canAuthorSop,
  canCreateSop,
  canSeeVersion,
} from './access';
import type { AuthUser } from './auth';
import {
  C,
  bangkokDate,
  data,
  getDb,
  iso,
  newId,
  now,
  type CategoryDoc,
  type DiagramDoc,
  type SopDoc,
  type StepDoc,
  type UserDoc,
  type VersionDoc,
  type VersionSummaryDoc,
} from './db';
import { HttpError, badRequest, conflict, forbidden, notFound, str, uuid } from './http';

const ACTIVE_STATES: VersionState[] = ['DRAFT', 'IN_REVIEW', 'IN_APPROVAL'];
/** Firestore documents are limited to 1 MiB, so content + search text stay well below it. */
const MAX_TEXT_BYTES = 200_000;

const sopRef = (db: Firestore, id: string) => db.collection(C.sops).doc(id);
const versionRef = (db: Firestore, sopId: string, vid: string) => sopRef(db, sopId).collection(C.versions).doc(vid);
const diagramsCol = (db: Firestore, sopId: string, vid: string) =>
  versionRef(db, sopId, vid).collection(C.diagrams);

const summaryOf = (id: string, v: VersionDoc): VersionSummaryDoc => ({
  id,
  state: v.state,
  revision_no: v.revision_no,
  label: v.version_label,
  effective_date: v.effective_date,
  updated_at: v.updated_at,
});

function truncateBytes(text: string, max: number): string {
  if (Buffer.byteLength(text, 'utf8') <= max) return text;
  let s = text.slice(0, max);
  while (Buffer.byteLength(s, 'utf8') > max) s = s.slice(0, Math.floor(s.length * 0.9));
  return s;
}

async function userRefs(db: Firestore, ids: Iterable<string | null | undefined>): Promise<Map<string, UserRef>> {
  const unique = [...new Set([...ids].filter((x): x is string => !!x))];
  const map = new Map<string, UserRef>();
  if (!unique.length) return map;
  const snaps = await db.getAll(...unique.map((id) => db.collection(C.users).doc(id)));
  for (const s of snaps) {
    const u = s.data() as UserDoc | undefined;
    map.set(s.id, { id: s.id, full_name: u?.full_name ?? '', email: u?.email ?? '' });
  }
  return map;
}
const refOf = (m: Map<string, UserRef>, id: string | null | undefined): UserRef | null =>
  id ? (m.get(id) ?? { id, full_name: '', email: '' }) : null;

async function categoryMap(db: Firestore): Promise<Map<string, CategoryDoc & { id: string }>> {
  const snap = await db.collection(C.categories).get();
  return new Map(snap.docs.map((d) => [d.id, { id: d.id, ...(d.data() as CategoryDoc) }]));
}

function versionSummary(id: string, v: VersionDoc): VersionSummary {
  return {
    id,
    revision_no: v.revision_no,
    version_label: v.version_label,
    state: v.state,
    title: v.title,
    created_at: iso(v.created_at)!,
    updated_at: iso(v.updated_at)!,
    published_at: iso(v.published_at),
    effective_date: v.effective_date,
    superseded_at: iso(v.superseded_at),
  };
}

function stepOut(id: string, s: StepDoc, users: Map<string, UserRef>): ApprovalStep {
  return {
    id,
    attempt_no: s.attempt_no,
    step_no: s.step_no,
    step_type: s.step_type,
    state: s.state,
    comment: s.comment,
    assignee: refOf(users, s.assignee_id)!,
    decided_by: refOf(users, s.decided_by),
    decided_at: iso(s.decided_at),
    created_at: iso(s.created_at)!,
  };
}

// ═══ Library / search ══════════════════════════════════════════════════

interface ListOptions {
  q?: string;
  categoryId?: string | null;
  orderBy?: 'code' | 'recent';
  limit?: number;
}

export async function listSops(user: AuthUser, opts: ListOptions = {}): Promise<SopListItem[]> {
  const db = await getDb();
  const q = (opts.q ?? '').trim().toLowerCase().slice(0, 100);
  const limit = Math.min(Math.max(opts.limit ?? 500, 1), 500);
  const [sopsSnap, cats, assigned] = await Promise.all([
    db.collection(C.sops).get(),
    categoryMap(db),
    assignedVersionIds(db, user),
  ]);

  type Row = { id: string; s: SopDoc; pv: VersionSummaryDoc | null; av: VersionSummaryDoc | null };
  let rows: Row[] = [];
  for (const doc of sopsSnap.docs) {
    const s = doc.data() as SopDoc;
    if (opts.categoryId && s.category_id !== opts.categoryId) continue;
    const av = s.active && canSeeVersion(user, s, s.active, assigned) ? s.active : null;
    if (!s.published && !av) continue;
    rows.push({ id: doc.id, s, pv: s.published, av });
  }

  if (q) {
    const direct = new Set(rows.filter((r) => `${r.s.code} ${r.s.title}`.toLowerCase().includes(q)).map((r) => r.id));
    // Thai has no word boundaries: plain substring search over the versions the user may read.
    const refs = rows
      .filter((r) => !direct.has(r.id))
      .flatMap((r) => [r.pv, r.av].filter(Boolean).map((v) => versionRef(db, r.id, v!.id)));
    const texts = refs.length ? await db.getAll(...refs, { fieldMask: ['content_text'] }) : [];
    for (const t of texts) {
      if (String(t.get('content_text') ?? '').toLowerCase().includes(q)) direct.add(t.ref.parent.parent!.id);
    }
    rows = rows.filter((r) => direct.has(r.id));
  }

  const lastChange = (r: Row) => Math.max(r.s.updated_at.toMillis(), r.av?.updated_at.toMillis() ?? 0);
  rows.sort((a, b) => (opts.orderBy === 'recent' ? lastChange(b) - lastChange(a) : a.s.code.localeCompare(b.s.code)));

  return rows.slice(0, limit).map((r) => {
    const cat = r.s.category_id ? cats.get(r.s.category_id) : undefined;
    return {
      id: r.id,
      code: r.s.code,
      title: r.s.title,
      category: cat ? { id: cat.id, name: cat.name } : null,
      published: r.pv ? { id: r.pv.id, label: r.pv.label ?? '', effective_date: r.pv.effective_date } : null,
      active: r.av ? { id: r.av.id, state: r.av.state, revision_no: r.av.revision_no } : null,
      updated_at: new Date(lastChange(r)).toISOString(),
    };
  });
}

// ═══ SOP detail ════════════════════════════════════════════════════════

export async function getSopDetail(user: AuthUser, sopId: string, versionId?: string | null): Promise<SopDetail> {
  const db = await getDb();
  const sop = data<SopDoc>(await sopRef(db, sopId).get());
  if (!sop) throw notFound('ไม่พบ SOP นี้');

  const [versionsSnap, stepsSnap] = await Promise.all([
    sopRef(db, sopId).collection(C.versions).get(),
    db.collection(C.steps).where('sop_id', '==', sopId).get(),
  ]);
  const steps = stepsSnap.docs.map((d) => ({ id: d.id, s: d.data() as StepDoc }));
  const assigned = new Set(steps.filter((x) => x.s.assignee_id === user.id).map((x) => x.s.version_id));
  const all = versionsSnap.docs.map((d) => ({ id: d.id, v: d.data() as VersionDoc }));
  const visible = all
    .filter((x) => canSeeVersion(user, sop, { id: x.id, state: x.v.state }, assigned))
    .sort((a, b) => b.v.revision_no - a.v.revision_no);
  if (visible.length === 0) throw notFound('ไม่พบ SOP นี้');

  const isAuthor = canAuthorSop(user, sop);
  const active = visible.find((x) => ACTIVE_STATES.includes(x.v.state));
  const published = visible.find((x) => x.v.state === 'PUBLISHED');

  let selected: (typeof visible)[number] | undefined;
  if (versionId) {
    selected = visible.find((x) => x.id === versionId);
    if (!selected) throw notFound('ไม่พบเวอร์ชันนี้ หรือคุณไม่มีสิทธิ์เข้าถึง');
  } else {
    const pendingOnActive =
      !!active && steps.some((x) => x.s.version_id === active.id && x.s.assignee_id === user.id && x.s.state === 'PENDING');
    selected = (active && (isAuthor || pendingOnActive) ? active : published) ?? active ?? visible[0];
  }
  const v = selected.v;
  const vSteps = steps
    .filter((x) => x.s.version_id === selected.id)
    .sort((a, b) => a.s.attempt_no - b.s.attempt_no || a.s.step_no - b.s.step_no);
  const canEdit = v.state === 'DRAFT' && isAuthor;

  const [diagramsSnap, auditSnap, categorySnap, activeUsers] = await Promise.all([
    diagramsCol(db, sopId, selected.id).get(),
    isAuthor ? sopRef(db, sopId).collection(C.audit).orderBy('created_at', 'desc').limit(30).get() : null,
    sop.category_id ? db.collection(C.categories).doc(sop.category_id).get() : null,
    canEdit ? db.collection(C.users).where('is_active', '==', true).get() : null,
  ]);
  const users = await userRefs(db, [
    sop.owner_id,
    v.created_by,
    v.published_by,
    ...vSteps.flatMap((x) => [x.s.assignee_id, x.s.decided_by]),
    ...(auditSnap?.docs.map((d) => d.get('actor_id') as string | null) ?? []),
  ]);
  const versionById = new Map(all.map((x) => [x.id, x.v]));

  const version: VersionDetail = {
    ...versionSummary(selected.id, v),
    content_json: JSON.parse(v.content_json) as TiptapDoc,
    change_note: v.change_note,
    major_change: v.major_change,
    row_version: v.row_version,
    based_on_label: v.based_on_label,
    created_by: refOf(users, v.created_by)!,
    published_by: refOf(users, v.published_by),
    diagrams: diagramsSnap.docs.map((d) => {
      const x = d.data() as DiagramDoc;
      return { block_id: d.id, xml_source: x.xml_source, preview_png_data: x.preview_png_data, updated_at: iso(x.updated_at)! };
    }),
    steps: vSteps.map((x) => stepOut(x.id, x.s, users)),
  };

  const pendingStep = vSteps.find(
    (x) => x.s.state === 'PENDING' && (x.s.assignee_id === user.id || user.role === 'ADMIN'),
  );

  let assignees: SopDetail['assignees'] = null;
  if (activeUsers) {
    const candidates = activeUsers.docs
      .map((d) => ({ id: d.id, u: d.data() as UserDoc }))
      .filter((x) => x.id !== user.id && (REVIEWER_ROLES as readonly string[]).includes(x.u.role))
      .sort((a, b) => (a.u.full_name || a.u.email).localeCompare(b.u.full_name || b.u.email, 'th'));
    const ref = (x: (typeof candidates)[number]): UserRef => ({ id: x.id, full_name: x.u.full_name, email: x.u.email });
    assignees = {
      reviewers: candidates.map(ref),
      approvers: candidates.filter((x) => (APPROVER_ROLES as readonly string[]).includes(x.u.role)).map(ref),
    };
  }

  const auditEvents: AuditEvent[] | null = auditSnap
    ? auditSnap.docs.map((d) => {
        const e = d.data();
        const ev = e.version_id ? versionById.get(e.version_id) : undefined;
        return {
          event_type: e.event_type,
          metadata: e.metadata ?? {},
          created_at: iso(e.created_at)!,
          version_label: ev?.version_label ?? null,
          revision_no: ev?.revision_no ?? null,
          actor: refOf(users, e.actor_id),
        };
      })
    : null;

  const category = categorySnap?.exists ? { id: categorySnap.id, name: categorySnap.get('name') as string } : null;
  return {
    sop: {
      id: sopId,
      code: sop.code,
      title: sop.title,
      owner: refOf(users, sop.owner_id)!,
      category,
      published_version_id: sop.published_version_id,
      created_at: iso(sop.created_at)!,
    },
    versions: visible.map((x) => versionSummary(x.id, x.v)),
    version,
    permissions: {
      canEdit,
      canSubmit: canEdit,
      canCreateRevision: isAuthor && !!sop.published_version_id && !sop.active_version_id,
      canShare: isAuthor && !!sop.published_version_id,
      pendingStepId: pendingStep?.id ?? null,
    },
    assignees,
    audit: auditEvents,
  };
}

// ═══ Codes ═════════════════════════════════════════════════════════════
// SOP codes are issued by the system — SOP-<CATEGORY CODE>-<running number>, e.g. SOP-SALES-001 —
// and never typed or changed by users. A code stays with its SOP even if the category changes later.

const codePrefix = (categorySlug: string) => `SOP-${categorySlug.toUpperCase()}`;
const formatCode = (prefix: string, n: number) => `${prefix}-${String(n).padStart(3, '0')}`;

/** Highest running number issued under `prefix`. Read inside `t` when given, so concurrent creates are serialized. */
async function lastIssuedNumber(db: Firestore, prefix: string, t?: Transaction): Promise<number> {
  const counterRef = db.collection(C.sopCodeCounters).doc(prefix);
  const counter = t ? await t.get(counterRef) : await counterRef.get();
  if (counter.exists) return Number(counter.get('last')) || 0;
  // No counter yet: continue after codes that already use this prefix ('.' is the character after '-').
  const existing = db
    .collection(C.sopCodes)
    .where(FieldPath.documentId(), '>=', `${prefix}-`)
    .where(FieldPath.documentId(), '<', `${prefix}.`);
  const snap = t ? await t.get(existing) : await existing.get();
  let max = 0;
  for (const d of snap.docs) {
    const rest = d.id.slice(prefix.length + 1);
    if (/^\d+$/.test(rest)) max = Math.max(max, Number(rest));
  }
  return max;
}

async function categoryForCode(db: Firestore, categoryId: string, t?: Transaction): Promise<CategoryDoc> {
  const ref = db.collection(C.categories).doc(categoryId);
  const cat = data<CategoryDoc>(t ? await t.get(ref) : await ref.get());
  if (!cat) throw badRequest('ไม่พบหมวดหมู่ที่เลือก');
  return cat;
}

/** The code the next SOP in this category would get (a preview — the number is fixed only when the SOP is created). */
export async function nextSopCode(user: AuthUser, categoryId: string): Promise<{ code: string }> {
  if (!canCreateSop(user)) throw forbidden('เฉพาะผู้เขียนหรือผู้ดูแลระบบที่สร้าง SOP ได้');
  const db = await getDb();
  const prefix = codePrefix((await categoryForCode(db, categoryId)).slug);
  return { code: formatCode(prefix, (await lastIssuedNumber(db, prefix)) + 1) };
}

// ═══ Create ════════════════════════════════════════════════════════════

export async function createSop(user: AuthUser, body: Record<string, unknown>): Promise<{ id: string; code: string }> {
  if (!canCreateSop(user)) throw forbidden('เฉพาะผู้เขียนหรือผู้ดูแลระบบที่สร้าง SOP ได้');
  const title = str(body.title, 'ชื่อเอกสาร', { max: 200 });
  if (!body.categoryId) throw badRequest('กรุณาเลือกหมวดหมู่ (รหัส SOP ออกตามหมวด)');
  const categoryId = uuid(body.categoryId, 'หมวดหมู่');

  const db = await getDb();
  const sopId = newId();
  const versionId = newId();
  const issued = await db.runTransaction(async (t) => {
    const prefix = codePrefix((await categoryForCode(db, categoryId, t)).slug);
    const counterRef = db.collection(C.sopCodeCounters).doc(prefix);
    let n = (await lastIssuedNumber(db, prefix, t)) + 1;
    let code = formatCode(prefix, n);
    // Safety net: skip numbers whose code already exists (e.g. typed by hand before auto-numbering).
    for (let tries = 0; (await t.get(db.collection(C.sopCodes).doc(code))).exists; tries++) {
      if (tries >= 50) throw conflict('ออกรหัส SOP ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง', 'CODE_EXHAUSTED');
      code = formatCode(prefix, ++n);
    }

    const ts = now();
    const content = sopTemplate();
    const version: VersionDoc = {
      revision_no: 1,
      version_label: null,
      state: 'DRAFT',
      title,
      content_json: JSON.stringify(content),
      content_text: docToText(content),
      change_note: '',
      major_change: false,
      based_on_version_id: null,
      based_on_label: null,
      row_version: 1,
      last_attempt_no: 0,
      created_by: user.id,
      updated_by: user.id,
      created_at: ts,
      updated_at: ts,
      submitted_at: null,
      published_at: null,
      published_by: null,
      effective_date: null,
      superseded_at: null,
    };
    const sop: SopDoc = {
      code,
      title,
      owner_id: user.id,
      category_id: categoryId,
      published_version_id: null,
      active_version_id: versionId,
      published: null,
      active: summaryOf(versionId, version),
      last_revision_no: 1,
      created_at: ts,
      updated_at: ts,
    };
    t.set(counterRef, { last: n, updated_at: ts });
    t.create(db.collection(C.sopCodes).doc(code), { sop_id: sopId });
    t.create(sopRef(db, sopId), sop);
    t.create(versionRef(db, sopId, versionId), version);
    audit(db, t, { actor: user.id, sop: sopId, version: versionId, type: 'SOP_CREATED', meta: { code, title } });
    return code;
  });
  return { id: sopId, code: issued };
}

// ═══ Draft editing ═════════════════════════════════════════════════════

/** Read the SOP + version inside a transaction and check that the caller may edit the draft. */
async function lockDraft(db: Firestore, t: Transaction, user: AuthUser, sopId: string, versionId: string) {
  const [sopSnap, vSnap] = await t.getAll(sopRef(db, sopId), versionRef(db, sopId, versionId));
  const sop = data<SopDoc>(sopSnap);
  if (!sop) throw notFound('ไม่พบ SOP นี้');
  if (!canAuthorSop(user, sop)) throw forbidden('เฉพาะเจ้าของเอกสารหรือผู้ดูแลระบบที่แก้ไขได้');
  const version = data<VersionDoc>(vSnap);
  if (!version) throw notFound('ไม่พบเวอร์ชันนี้');
  if (version.state !== 'DRAFT') {
    throw conflict('แก้ไขได้เฉพาะฉบับร่างเท่านั้น เอกสารนี้อยู่ระหว่างพิจารณาหรือเผยแพร่แล้ว', 'NOT_DRAFT');
  }
  return { sop, version };
}

export async function saveDraft(user: AuthUser, sopId: string, versionId: string, body: Record<string, unknown>) {
  const title = str(body.title, 'ชื่อเอกสาร', { max: 200 });
  const content = sanitizeDoc(body.content);
  const json = JSON.stringify(content);
  if (Buffer.byteLength(json, 'utf8') > MAX_DOC_BYTES) {
    throw new HttpError(413, 'เนื้อหามีขนาดใหญ่เกินกำหนด', 'TOO_LARGE');
  }
  const text = truncateBytes(docToText(content), MAX_TEXT_BYTES);
  const rowVersion = typeof body.rowVersion === 'number' ? body.rowVersion : null;
  const categoryProvided = Object.prototype.hasOwnProperty.call(body, 'categoryId');
  const categoryId = categoryProvided && body.categoryId ? uuid(body.categoryId, 'หมวดหมู่') : null;
  const keep = new Set(diagramIds(content));

  const db = await getDb();
  return db.runTransaction(async (t) => {
    const { sop, version } = await lockDraft(db, t, user, sopId, versionId);
    if (rowVersion !== null && rowVersion !== version.row_version) {
      throw conflict('เอกสารนี้ถูกแก้ไขจากที่อื่นหลังจากที่คุณเปิด กรุณาโหลดหน้าใหม่ก่อนบันทึก', 'STALE');
    }
    if (categoryId) {
      const cat = await t.get(db.collection(C.categories).doc(categoryId));
      if (!cat.exists) throw badRequest('ไม่พบหมวดหมู่ที่เลือก');
    }
    const existingDiagrams = await t.get(diagramsCol(db, sopId, versionId));

    const ts = now();
    const nextRow = version.row_version + 1;
    t.update(versionRef(db, sopId, versionId), {
      title,
      content_json: json,
      content_text: text,
      row_version: nextRow,
      updated_by: user.id,
      updated_at: ts,
    });
    // Diagrams removed from the content are removed from the version too.
    for (const d of existingDiagrams.docs) if (!keep.has(d.id)) t.delete(d.ref);
    t.update(sopRef(db, sopId), {
      updated_at: ts,
      ...(sop.active?.id === versionId ? { 'active.updated_at': ts } : {}),
      // The SOP title follows the published version; before the first publish it follows the draft.
      ...(sop.published_version_id ? {} : { title }),
      ...(categoryProvided ? { category_id: categoryId } : {}),
    });
    audit(db, t, {
      actor: user.id,
      sop: sopId,
      version: versionId,
      type: 'DRAFT_SAVED',
      meta: { revision_no: version.revision_no },
    });
    return { row_version: nextRow, updated_at: ts.toDate().toISOString() };
  });
}

const PNG_DATA_RE = /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/;
const MAX_XML_BYTES = 300_000;
const MAX_PNG_CHARS = 650_000;

export async function saveDiagram(
  user: AuthUser,
  sopId: string,
  versionId: string,
  blockId: string,
  body: Record<string, unknown>,
): Promise<Diagram> {
  if (!BLOCK_ID_RE.test(blockId)) throw badRequest('รหัส Flowchart ไม่ถูกต้อง');
  const xml = body.xml;
  if (typeof xml !== 'string' || !xml.trim().startsWith('<') || !/mxfile|mxGraphModel/.test(xml.slice(0, 2000))) {
    throw badRequest('ข้อมูล Flowchart (XML) ไม่ถูกต้อง');
  }
  if (Buffer.byteLength(xml, 'utf8') > MAX_XML_BYTES) {
    throw new HttpError(413, 'Flowchart มีขนาดใหญ่เกินกำหนด กรุณาแบ่งเป็นหลายผัง', 'TOO_LARGE');
  }
  let png: string | null = null;
  if (body.png !== undefined && body.png !== null && body.png !== '') {
    if (typeof body.png !== 'string' || !PNG_DATA_RE.test(body.png)) throw badRequest('ภาพตัวอย่างต้องเป็นไฟล์ PNG');
    if (body.png.length > MAX_PNG_CHARS) {
      throw new HttpError(413, 'ภาพตัวอย่าง Flowchart มีขนาดใหญ่เกินกำหนด', 'TOO_LARGE');
    }
    png = body.png;
  }

  const db = await getDb();
  return db.runTransaction(async (t) => {
    const { sop } = await lockDraft(db, t, user, sopId, versionId);
    const ref = diagramsCol(db, sopId, versionId).doc(blockId);
    const existing = data<DiagramDoc>(await t.get(ref));
    const ts = now();
    const doc: DiagramDoc = {
      xml_source: xml,
      preview_png_data: png,
      updated_by: user.id,
      created_at: existing?.created_at ?? ts,
      updated_at: ts,
    };
    t.set(ref, doc);
    t.update(versionRef(db, sopId, versionId), { updated_at: ts, updated_by: user.id });
    t.update(sopRef(db, sopId), {
      updated_at: ts,
      ...(sop.active?.id === versionId ? { 'active.updated_at': ts } : {}),
    });
    audit(db, t, { actor: user.id, sop: sopId, version: versionId, type: 'DIAGRAM_SAVED', meta: { block_id: blockId } });
    return { block_id: blockId, xml_source: xml, preview_png_data: png, updated_at: ts.toDate().toISOString() };
  });
}

// ═══ New revision from the published version ═══════════════════════════

export async function createRevision(user: AuthUser, sopId: string): Promise<{ versionId: string }> {
  const db = await getDb();
  const versionId = newId();
  await db.runTransaction(async (t) => {
    const sop = data<SopDoc>(await t.get(sopRef(db, sopId)));
    if (!sop) throw notFound('ไม่พบ SOP นี้');
    if (!canAuthorSop(user, sop)) throw forbidden('เฉพาะเจ้าของเอกสารหรือผู้ดูแลระบบที่สร้างฉบับแก้ไขได้');
    if (!sop.published_version_id) throw conflict('SOP นี้ยังไม่มีฉบับเผยแพร่', 'NOT_PUBLISHED');
    if (sop.active_version_id) throw conflict('SOP นี้มีฉบับร่างหรือฉบับที่รอพิจารณาอยู่แล้ว', 'ACTIVE_EXISTS');
    const pvId = sop.published_version_id;
    const [pvSnap, pvDiagrams] = await Promise.all([
      t.get(versionRef(db, sopId, pvId)),
      t.get(diagramsCol(db, sopId, pvId)),
    ]);
    const pv = data<VersionDoc>(pvSnap);
    if (!pv) throw notFound('ไม่พบฉบับเผยแพร่');

    const ts = now();
    const revision = sop.last_revision_no + 1;
    const version: VersionDoc = {
      revision_no: revision,
      version_label: null,
      state: 'DRAFT',
      title: pv.title,
      content_json: pv.content_json,
      content_text: pv.content_text,
      change_note: '',
      major_change: false,
      based_on_version_id: pvId,
      based_on_label: pv.version_label,
      row_version: 1,
      last_attempt_no: 0,
      created_by: user.id,
      updated_by: user.id,
      created_at: ts,
      updated_at: ts,
      submitted_at: null,
      published_at: null,
      published_by: null,
      effective_date: null,
      superseded_at: null,
    };
    t.create(versionRef(db, sopId, versionId), version);
    for (const d of pvDiagrams.docs) {
      const x = d.data() as DiagramDoc;
      t.create(diagramsCol(db, sopId, versionId).doc(d.id), { ...x, updated_by: user.id, created_at: ts, updated_at: ts });
    }
    t.update(sopRef(db, sopId), {
      active_version_id: versionId,
      active: summaryOf(versionId, version),
      last_revision_no: revision,
      updated_at: ts,
    });
    audit(db, t, {
      actor: user.id,
      sop: sopId,
      version: versionId,
      type: 'REVISION_CREATED',
      meta: { from_label: pv.version_label, revision_no: revision },
    });
  });
  return { versionId };
}

// ═══ Approval workflow ═════════════════════════════════════════════════

export async function submitForReview(user: AuthUser, sopId: string, body: Record<string, unknown>) {
  const versionId = uuid(body.versionId, 'เวอร์ชัน');
  const reviewerId = uuid(body.reviewerId, 'ผู้ตรวจทาน');
  const approverId = uuid(body.approverId, 'ผู้อนุมัติ');
  const changeNote = str(body.changeNote, 'สรุปการเปลี่ยนแปลง', { optional: true, max: 1000 });
  const majorChange = body.majorChange === true;
  if (reviewerId === approverId) throw badRequest('ผู้ตรวจทานและผู้อนุมัติต้องเป็นคนละคน');
  if (reviewerId === user.id || approverId === user.id) {
    throw badRequest('ผู้ส่งเอกสารไม่สามารถเป็นผู้ตรวจทานหรือผู้อนุมัติของตนเองได้');
  }

  const db = await getDb();
  return db.runTransaction(async (t) => {
    const { sop, version } = await lockDraft(db, t, user, sopId, versionId);
    const [rSnap, aSnap] = await t.getAll(db.collection(C.users).doc(reviewerId), db.collection(C.users).doc(approverId));
    if (!version.content_text.trim()) throw badRequest('กรุณาเพิ่มเนื้อหาก่อนส่งตรวจ');
    const reviewer = data<UserDoc>(rSnap);
    const approver = data<UserDoc>(aSnap);
    if (!reviewer?.is_active || !(REVIEWER_ROLES as readonly string[]).includes(reviewer.role)) {
      throw badRequest('ผู้ตรวจทานต้องมีบทบาท Reviewer, Approver หรือ Admin และยังใช้งานอยู่');
    }
    if (!approver?.is_active || !(APPROVER_ROLES as readonly string[]).includes(approver.role)) {
      throw badRequest('ผู้อนุมัติต้องมีบทบาท Approver หรือ Admin และยังใช้งานอยู่');
    }

    const ts = now();
    const attempt = version.last_attempt_no + 1;
    const step = (no: 1 | 2): StepDoc => ({
      sop_id: sopId,
      version_id: versionId,
      attempt_no: attempt,
      step_no: no,
      step_type: no === 1 ? 'REVIEW' : 'APPROVE',
      assignee_id: no === 1 ? reviewerId : approverId,
      state: no === 1 ? 'PENDING' : 'WAITING',
      comment: '',
      decided_by: null,
      decided_at: null,
      created_at: ts,
    });
    t.create(db.collection(C.steps).doc(newId()), step(1));
    t.create(db.collection(C.steps).doc(newId()), step(2));
    t.update(versionRef(db, sopId, versionId), {
      state: 'IN_REVIEW',
      submitted_at: ts,
      change_note: changeNote,
      major_change: majorChange,
      row_version: version.row_version + 1,
      last_attempt_no: attempt,
      updated_at: ts,
      updated_by: user.id,
    });
    t.update(sopRef(db, sopId), {
      updated_at: ts,
      ...(sop.active?.id === versionId ? { 'active.state': 'IN_REVIEW', 'active.updated_at': ts } : {}),
    });
    audit(db, t, {
      actor: user.id,
      sop: sopId,
      version: versionId,
      type: 'SUBMITTED',
      meta: { attempt_no: attempt, revision_no: version.revision_no, reviewer_id: reviewerId, approver_id: approverId },
    });
    return { state: 'IN_REVIEW' as VersionState, attempt_no: attempt };
  });
}

function nextLabel(current: string | null, major: boolean): string {
  if (!current) return '1.0';
  const [maj, min] = current.split('.').map((n) => Number(n));
  return major ? `${maj + 1}.0` : `${maj}.${min + 1}`;
}

export async function decide(user: AuthUser, stepId: string, body: Record<string, unknown>) {
  const decision = body.decision;
  if (decision !== 'APPROVE' && decision !== 'REJECT') throw badRequest('กรุณาเลือกผลการพิจารณา');
  const comment = str(body.comment, 'เหตุผล', { optional: decision === 'APPROVE', max: 2000 });

  const db = await getDb();
  return db.runTransaction(async (t) => {
    // All reads first (Firestore transactions), then validation, then writes.
    const stepRef = db.collection(C.steps).doc(stepId);
    const step = data<StepDoc>(await t.get(stepRef));
    if (!step) throw notFound('ไม่พบรายการพิจารณานี้');
    const sId = step.sop_id;
    const vId = step.version_id;
    const [sopSnap, vSnap] = await t.getAll(sopRef(db, sId), versionRef(db, sId, vId));
    const siblings = await t.get(
      db.collection(C.steps).where('version_id', '==', vId).where('attempt_no', '==', step.attempt_no),
    );
    const sop = data<SopDoc>(sopSnap)!;
    const version = data<VersionDoc>(vSnap)!;
    const publishing = decision === 'APPROVE' && step.step_no === 2;
    const oldPvId = publishing ? sop.published_version_id : null;
    const oldPv = oldPvId ? data<VersionDoc>(await t.get(versionRef(db, sId, oldPvId))) : null;

    const adminOverride = step.assignee_id !== user.id;
    if (adminOverride && user.role !== 'ADMIN') throw forbidden('รายการนี้ไม่ได้มอบหมายให้คุณ');
    if (step.state !== 'PENDING') throw conflict('รายการนี้ได้รับการพิจารณาไปแล้ว', 'ALREADY_DECIDED');
    const expected = step.step_no === 1 ? 'IN_REVIEW' : 'IN_APPROVAL';
    if (version.state !== expected) throw conflict('สถานะเอกสารเปลี่ยนไปแล้ว กรุณาโหลดใหม่', 'STATE_CHANGED');

    const ts = now();
    const meta = { attempt_no: step.attempt_no, revision_no: version.revision_no, comment, admin_override: adminOverride };
    t.update(stepRef, {
      state: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
      comment,
      decided_by: user.id,
      decided_at: ts,
    });
    const isActive = sop.active?.id === vId;

    if (decision === 'REJECT') {
      for (const d of siblings.docs) {
        if (d.id !== stepId && ['WAITING', 'PENDING'].includes(d.get('state'))) t.update(d.ref, { state: 'CANCELLED' });
      }
      t.update(versionRef(db, sId, vId), { state: 'DRAFT', row_version: version.row_version + 1, updated_at: ts });
      t.update(sopRef(db, sId), {
        updated_at: ts,
        ...(isActive ? { 'active.state': 'DRAFT', 'active.updated_at': ts } : {}),
      });
      audit(db, t, {
        actor: user.id,
        sop: sId,
        version: vId,
        type: step.step_no === 1 ? 'REVIEW_REJECTED' : 'APPROVAL_REJECTED',
        meta,
      });
      return { state: 'DRAFT' as VersionState };
    }

    if (step.step_no === 1) {
      for (const d of siblings.docs) {
        if (d.get('step_no') === 2 && d.get('state') === 'WAITING') t.update(d.ref, { state: 'PENDING' });
      }
      t.update(versionRef(db, sId, vId), { state: 'IN_APPROVAL', updated_at: ts });
      t.update(sopRef(db, sId), {
        updated_at: ts,
        ...(isActive ? { 'active.state': 'IN_APPROVAL', 'active.updated_at': ts } : {}),
      });
      audit(db, t, { actor: user.id, sop: sId, version: vId, type: 'REVIEW_APPROVED', meta });
      return { state: 'IN_APPROVAL' as VersionState };
    }

    // Final approval → publish: supersede the old version, publish the new one, move the pointers.
    const oldLabel = oldPv?.state === 'PUBLISHED' ? oldPv.version_label : null;
    if (oldPvId && oldPv?.state === 'PUBLISHED') {
      t.update(versionRef(db, sId, oldPvId), { state: 'SUPERSEDED', superseded_at: ts });
    }
    const label = nextLabel(oldLabel, version.major_change);
    const effective = bangkokDate(ts.toDate());
    const publishedVersion: VersionDoc = {
      ...version,
      state: 'PUBLISHED',
      version_label: label,
      published_at: ts,
      published_by: user.id,
      effective_date: effective,
      updated_at: ts,
    };
    t.update(versionRef(db, sId, vId), {
      state: 'PUBLISHED',
      version_label: label,
      published_at: ts,
      published_by: user.id,
      effective_date: effective,
      updated_at: ts,
    });
    t.update(sopRef(db, sId), {
      published_version_id: vId,
      published: summaryOf(vId, publishedVersion),
      active_version_id: null,
      active: null,
      title: version.title,
      updated_at: ts,
    });
    audit(db, t, { actor: user.id, sop: sId, version: vId, type: 'PUBLISHED', meta: { ...meta, label } });
    if (oldPvId && oldLabel) {
      audit(db, t, {
        actor: user.id,
        sop: sId,
        version: oldPvId,
        type: 'SUPERSEDED',
        meta: { label: oldLabel, replaced_by: label },
      });
    }
    return { state: 'PUBLISHED' as VersionState, label };
  });
}

export async function listApprovals(user: AuthUser, opts: { mineOnly?: boolean } = {}): Promise<ApprovalTask[]> {
  const db = await getDb();
  const allForAdmin = user.role === 'ADMIN' && !opts.mineOnly;
  let query = db.collection(C.steps).where('state', '==', 'PENDING');
  if (!allForAdmin) query = query.where('assignee_id', '==', user.id);
  const pending = (await query.get()).docs.map((d) => ({ id: d.id, s: d.data() as StepDoc }));
  if (pending.length === 0) return [];

  const [sopSnaps, versionSnaps, cats] = await Promise.all([
    db.getAll(...pending.map((p) => sopRef(db, p.s.sop_id))),
    db.getAll(...pending.map((p) => versionRef(db, p.s.sop_id, p.s.version_id))),
    categoryMap(db),
  ]);
  const stepsByVersion = new Map<string, { id: string; s: StepDoc }[]>();
  await Promise.all(
    [...new Set(pending.map((p) => p.s.version_id))].map(async (vid) => {
      const snap = await db.collection(C.steps).where('version_id', '==', vid).get();
      stepsByVersion.set(vid, snap.docs.map((d) => ({ id: d.id, s: d.data() as StepDoc })));
    }),
  );
  const sops = sopSnaps.map((s) => s.data() as SopDoc);
  const versions = versionSnaps.map((s) => s.data() as VersionDoc);
  const users = await userRefs(db, [
    ...sops.map((s) => s.owner_id),
    ...[...stepsByVersion.values()].flat().flatMap((x) => [x.s.assignee_id, x.s.decided_by]),
  ]);

  const tasks = pending.map((p, i): ApprovalTask => {
    const sop = sops[i];
    const v = versions[i];
    const vSteps = (stepsByVersion.get(p.s.version_id) ?? [])
      .sort((a, b) => a.s.attempt_no - b.s.attempt_no || a.s.step_no - b.s.step_no)
      .map((x) => stepOut(x.id, x.s, users));
    const cat = sop.category_id ? cats.get(sop.category_id) : undefined;
    return {
      step_id: p.id,
      step_no: p.s.step_no,
      step_type: p.s.step_type,
      attempt_no: p.s.attempt_no,
      assigned_to_me: p.s.assignee_id === user.id,
      assignee: refOf(users, p.s.assignee_id)!,
      sop_id: p.s.sop_id,
      code: sop.code,
      version_id: p.s.version_id,
      revision_no: v.revision_no,
      title: v.title,
      category: cat?.name ?? null,
      author: refOf(users, sop.owner_id)!,
      submitted_at: iso(v.submitted_at),
      major_change: v.major_change,
      change_note: v.change_note,
      current_label: sop.published?.label ?? null,
      steps: vSteps.filter((s) => s.attempt_no === p.s.attempt_no),
      history: vSteps.filter((s) => s.attempt_no < p.s.attempt_no && s.state === 'REJECTED'),
    };
  });
  return tasks.sort(
    (a, b) =>
      Number(b.assigned_to_me) - Number(a.assigned_to_me) ||
      (a.submitted_at ?? '').localeCompare(b.submitted_at ?? ''),
  );
}

export async function pendingCount(user: AuthUser): Promise<number> {
  const db = await getDb();
  const snap = await db
    .collection(C.steps)
    .where('assignee_id', '==', user.id)
    .where('state', '==', 'PENDING')
    .count()
    .get();
  return snap.data().count;
}

export async function dashboard(user: AuthUser): Promise<DashboardData> {
  const db = await getDb();
  const [all, cats, tasks] = await Promise.all([
    listSops(user, { orderBy: 'recent' }),
    db.collection(C.categories).count().get(),
    listApprovals(user, { mineOnly: true }),
  ]);
  const count = (state: VersionState) => all.filter((s) => s.active?.state === state).length;
  const published = all.filter((s) => s.published).length;
  return {
    stats: {
      accessible: all.length,
      published,
      drafts: count('DRAFT'),
      pending: count('IN_REVIEW') + count('IN_APPROVAL'),
      categories: cats.data().count,
    },
    pipeline: {
      DRAFT: count('DRAFT'),
      IN_REVIEW: count('IN_REVIEW'),
      IN_APPROVAL: count('IN_APPROVAL'),
      PUBLISHED: published,
    },
    recent: all.slice(0, 6),
    tasks,
  };
}
