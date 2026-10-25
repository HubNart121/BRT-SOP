import 'server-only';
import { MAX_DOC_BYTES, diagramIds, docToText, sanitizeDoc, sopTemplate, BLOCK_ID_RE } from '@/lib/shared/content';
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
import { APPROVER_ROLES, REVIEWER_ROLES, audit, canAuthorSop, canCreateSop, versionVisibleSql } from './access';
import type { AuthUser } from './auth';
import { getDb, type Queryable } from './db';
import { HttpError, badRequest, conflict, forbidden, notFound, str, uuid } from './http';

const ACTIVE_STATES: VersionState[] = ['DRAFT', 'IN_REVIEW', 'IN_APPROVAL'];
const CODE_RE = /^[A-Z0-9][A-Z0-9-]{1,39}$/;

const userRef = (alias: string) =>
  `json_build_object('id', ${alias}.id, 'full_name', ${alias}.full_name, 'email', ${alias}.email)`;

function escapeLike(q: string): string {
  return `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
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
  const q = (opts.q ?? '').trim().slice(0, 100);
  const order = opts.orderBy === 'recent' ? 'last_change desc' : 'code asc';
  const limit = Math.min(Math.max(opts.limit ?? 500, 1), 500);
  const avVisible = versionVisibleSql(user, 'av', 's', '$1');

  const { rows } = await db.query(
    `with base as (
       select s.id, s.code, s.title,
              greatest(s.updated_at, coalesce(av.updated_at, s.updated_at)) as last_change,
              pv.id as pv_id, pv.version_label as pv_label, pv.effective_date::text as pv_effective,
              pv.content_text as pv_text,
              case when av.id is not null and ${avVisible} then av.id end as av_id,
              av.state as av_state, av.revision_no as av_rev, av.content_text as av_text,
              cat.id as cat_id, cat.name as cat_name
         from sops s
         left join sop_versions pv on pv.id = s.published_version_id
         left join sop_versions av on av.sop_id = s.id and av.state in ('DRAFT', 'IN_REVIEW', 'IN_APPROVAL')
         left join lateral (
           select c.id, c.name from sop_category_links l join sop_categories c on c.id = l.category_id
            where l.sop_id = s.id order by c.sort_order, c.name limit 1
         ) cat on true
     )
     select * from base
      where (pv_id is not null or av_id is not null)
        and ($2::uuid is null or exists (
              select 1 from sop_category_links l where l.sop_id = base.id and l.category_id = $2::uuid))
        and ($3::text = '' or code ilike $3 or title ilike $3 or pv_text ilike $3
             or (av_id is not null and av_text ilike $3))
      order by ${order}
      limit ${limit}`,
    [user.id, opts.categoryId ?? null, q ? escapeLike(q) : ''],
  );

  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    title: r.title,
    category: r.cat_id ? { id: r.cat_id, name: r.cat_name } : null,
    published: r.pv_id ? { id: r.pv_id, label: r.pv_label, effective_date: r.pv_effective } : null,
    active: r.av_id ? { id: r.av_id, state: r.av_state, revision_no: r.av_rev } : null,
    updated_at: r.last_change,
  }));
}

// ═══ SOP detail ════════════════════════════════════════════════════════

const VERSION_SUMMARY_COLS = `v.id, v.revision_no, v.version_label, v.state, v.title, v.created_at, v.updated_at,
  v.published_at, v.effective_date::text as effective_date, v.superseded_at`;

async function loadSteps(q: Queryable, versionIds: string[]): Promise<(ApprovalStep & { version_id: string })[]> {
  if (versionIds.length === 0) return [];
  const { rows } = await q.query(
    `select st.id, st.version_id, st.attempt_no, st.step_no, st.step_type, st.state, st.comment,
            st.decided_at, st.created_at,
            ${userRef('a')} as assignee,
            case when d.id is null then null else ${userRef('d')} end as decided_by
       from approval_steps st
       join app_users a on a.id = st.assignee_id
       left join app_users d on d.id = st.decided_by
      where st.version_id = any($1::uuid[])
      order by st.attempt_no, st.step_no`,
    [versionIds],
  );
  return rows;
}

export async function getSopDetail(user: AuthUser, sopId: string, versionId?: string | null): Promise<SopDetail> {
  const db = await getDb();
  const sopRes = await db.query(
    `select s.id, s.code, s.title, s.owner_id, s.published_version_id, s.created_at,
            ${userRef('o')} as owner,
            (select json_build_object('id', c.id, 'name', c.name)
               from sop_category_links l join sop_categories c on c.id = l.category_id
              where l.sop_id = s.id order by c.sort_order limit 1) as category
       from sops s join app_users o on o.id = s.owner_id
      where s.id = $1`,
    [sopId],
  );
  const sop = sopRes.rows[0];
  if (!sop) throw notFound('ไม่พบ SOP นี้');

  const { rows: versions } = await db.query<VersionSummary>(
    `select ${VERSION_SUMMARY_COLS}
       from sop_versions v join sops s on s.id = v.sop_id
      where v.sop_id = $2 and ${versionVisibleSql(user, 'v', 's', '$1')}
      order by v.revision_no desc`,
    [user.id, sopId],
  );
  if (versions.length === 0) throw notFound('ไม่พบ SOP นี้');

  const isAuthor = canAuthorSop(user, sop);
  const active = versions.find((v) => ACTIVE_STATES.includes(v.state));
  const published = versions.find((v) => v.state === 'PUBLISHED');

  let selected: VersionSummary | undefined;
  if (versionId) {
    selected = versions.find((v) => v.id === versionId);
    if (!selected) throw notFound('ไม่พบเวอร์ชันนี้ หรือคุณไม่มีสิทธิ์เข้าถึง');
  } else {
    let pendingOnActive = false;
    if (active && !isAuthor) {
      const r = await db.query(
        `select 1 from approval_steps where version_id = $1 and assignee_id = $2 and state = 'PENDING'`,
        [active.id, user.id],
      );
      pendingOnActive = r.rows.length > 0;
    }
    selected = (active && (isAuthor || pendingOnActive) ? active : published) ?? active ?? versions[0];
  }

  const vRes = await db.query(
    `select ${VERSION_SUMMARY_COLS}, v.content_json, v.change_note, v.major_change, v.row_version,
            b.version_label as based_on_label,
            ${userRef('cb')} as created_by,
            case when pb.id is null then null else ${userRef('pb')} end as published_by
       from sop_versions v
       join app_users cb on cb.id = v.created_by
       left join app_users pb on pb.id = v.published_by
       left join sop_versions b on b.id = v.based_on_version_id
      where v.id = $1`,
    [selected.id],
  );
  const { rows: diagrams } = await db.query<Diagram>(
    `select block_id, xml_source, preview_png_data, updated_at from sop_diagrams where version_id = $1`,
    [selected.id],
  );
  const steps = await loadSteps(db, [selected.id]);
  const version: VersionDetail = { ...vRes.rows[0], diagrams, steps: steps.map(({ version_id: _, ...s }) => s) };

  const pendingStep = steps.find((s) => s.state === 'PENDING' && (s.assignee.id === user.id || user.role === 'ADMIN'));
  const hasActiveAny = active
    ? true
    : (await db.query(`select 1 from sop_versions where sop_id = $1 and state = any($2::text[])`, [sopId, ACTIVE_STATES]))
        .rows.length > 0;

  const canEdit = version.state === 'DRAFT' && isAuthor;

  let auditEvents: AuditEvent[] | null = null;
  if (isAuthor) {
    const { rows } = await db.query<AuditEvent>(
      `select e.event_type, e.metadata, e.created_at, v.version_label, v.revision_no,
              case when u.id is null then null else ${userRef('u')} end as actor
         from audit_events e
         left join app_users u on u.id = e.actor_id
         left join sop_versions v on v.id = e.version_id
        where e.sop_id = $1
        order by e.created_at desc, e.id desc
        limit 30`,
      [sopId],
    );
    auditEvents = rows;
  }

  let assignees: SopDetail['assignees'] = null;
  if (canEdit) {
    const { rows } = await db.query<UserRef & { role: string }>(
      `select id, full_name, email, role from app_users
        where is_active and id <> $1 and role = any($2::text[])
        order by full_name, email`,
      [user.id, [...REVIEWER_ROLES]],
    );
    assignees = {
      reviewers: rows.map(({ role: _, ...u }) => u),
      approvers: rows.filter((u) => (APPROVER_ROLES as readonly string[]).includes(u.role)).map(({ role: _, ...u }) => u),
    };
  }

  return {
    sop: {
      id: sop.id,
      code: sop.code,
      title: sop.title,
      owner: sop.owner,
      category: sop.category,
      published_version_id: sop.published_version_id,
      created_at: sop.created_at,
    },
    versions,
    version,
    permissions: {
      canEdit,
      canSubmit: canEdit,
      canCreateRevision: isAuthor && !!sop.published_version_id && !hasActiveAny,
      canShare: isAuthor && !!sop.published_version_id,
      pendingStepId: pendingStep?.id ?? null,
    },
    assignees,
    audit: auditEvents,
  };
}

// ═══ Create ════════════════════════════════════════════════════════════

export async function createSop(user: AuthUser, body: Record<string, unknown>): Promise<{ id: string }> {
  if (!canCreateSop(user)) throw forbidden('เฉพาะผู้เขียนหรือผู้ดูแลระบบที่สร้าง SOP ได้');
  const code = str(body.code, 'รหัส SOP', { max: 40 }).toUpperCase();
  if (!CODE_RE.test(code)) throw badRequest('รหัส SOP ใช้ได้เฉพาะ A-Z, 0-9 และ - เช่น SOP-WH-003');
  const title = str(body.title, 'ชื่อเอกสาร', { max: 200 });
  const categoryId = body.categoryId ? uuid(body.categoryId, 'หมวดหมู่') : null;

  const db = await getDb();
  try {
    return await db.tx(async (q) => {
      if (categoryId) {
        const c = await q.query(`select 1 from sop_categories where id = $1`, [categoryId]);
        if (!c.rows[0]) throw badRequest('ไม่พบหมวดหมู่ที่เลือก');
      }
      const { rows } = await q.query(`insert into sops (code, title, owner_id) values ($1, $2, $3) returning id`, [
        code,
        title,
        user.id,
      ]);
      const sopId: string = rows[0].id;
      const content = sopTemplate();
      const v = await q.query(
        `insert into sop_versions (sop_id, revision_no, state, title, content_json, content_text, created_by, updated_by)
         values ($1, 1, 'DRAFT', $2, $3, $4, $5, $5) returning id`,
        [sopId, title, JSON.stringify(content), docToText(content), user.id],
      );
      if (categoryId) {
        await q.query(`insert into sop_category_links (sop_id, category_id) values ($1, $2)`, [sopId, categoryId]);
      }
      await audit(q, { actor: user.id, sop: sopId, version: v.rows[0].id, type: 'SOP_CREATED', meta: { code, title } });
      return { id: sopId };
    });
  } catch (err) {
    if ((err as { code?: string }).code === '23505') throw conflict(`รหัส ${code} มีอยู่ในระบบแล้ว`, 'DUPLICATE_CODE');
    throw err;
  }
}

// ═══ Draft editing ═════════════════════════════════════════════════════

/** Lock the SOP + version rows and check that the caller may edit the draft. */
async function lockDraft(q: Queryable, user: AuthUser, sopId: string, versionId: string) {
  const sopRes = await q.query(`select id, owner_id, published_version_id from sops where id = $1 for update`, [sopId]);
  const sop = sopRes.rows[0];
  if (!sop) throw notFound('ไม่พบ SOP นี้');
  if (!canAuthorSop(user, sop)) throw forbidden('เฉพาะเจ้าของเอกสารหรือผู้ดูแลระบบที่แก้ไขได้');
  const vRes = await q.query(
    `select id, state, revision_no, row_version from sop_versions where id = $1 and sop_id = $2 for update`,
    [versionId, sopId],
  );
  const version = vRes.rows[0];
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
  if (json.length > MAX_DOC_BYTES) throw new HttpError(413, 'เนื้อหามีขนาดใหญ่เกินกำหนด', 'TOO_LARGE');
  const text = docToText(content);
  const rowVersion = typeof body.rowVersion === 'number' ? body.rowVersion : null;
  const categoryProvided = Object.prototype.hasOwnProperty.call(body, 'categoryId');
  const categoryId = categoryProvided && body.categoryId ? uuid(body.categoryId, 'หมวดหมู่') : null;

  const db = await getDb();
  return db.tx(async (q) => {
    const { sop, version } = await lockDraft(q, user, sopId, versionId);
    if (rowVersion !== null && rowVersion !== version.row_version) {
      throw conflict('เอกสารนี้ถูกแก้ไขจากที่อื่นหลังจากที่คุณเปิด กรุณาโหลดหน้าใหม่ก่อนบันทึก', 'STALE');
    }
    const { rows } = await q.query(
      `update sop_versions
          set title = $1, content_json = $2, content_text = $3, row_version = row_version + 1,
              updated_by = $4, updated_at = now()
        where id = $5
        returning row_version, updated_at`,
      [title, json, text, user.id, versionId],
    );
    // Diagrams removed from the content are removed from the version too.
    await q.query(`delete from sop_diagrams where version_id = $1 and not (block_id = any($2::text[]))`, [
      versionId,
      diagramIds(content),
    ]);
    if (categoryProvided) {
      if (categoryId) {
        const c = await q.query(`select 1 from sop_categories where id = $1`, [categoryId]);
        if (!c.rows[0]) throw badRequest('ไม่พบหมวดหมู่ที่เลือก');
      }
      await q.query(`delete from sop_category_links where sop_id = $1`, [sopId]);
      if (categoryId) {
        await q.query(`insert into sop_category_links (sop_id, category_id) values ($1, $2)`, [sopId, categoryId]);
      }
    }
    // The SOP title follows the published version; before the first publish it follows the draft.
    await q.query(
      `update sops set updated_at = now(), title = case when published_version_id is null then $2 else title end
        where id = $1`,
      [sopId, title],
    );
    await audit(q, {
      actor: user.id,
      sop: sopId,
      version: versionId,
      type: 'DRAFT_SAVED',
      meta: { revision_no: version.revision_no },
    });
    void sop;
    return { row_version: rows[0].row_version as number, updated_at: rows[0].updated_at as string };
  });
}

const PNG_DATA_RE = /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/;
const MAX_XML = 2_000_000;
const MAX_PNG = 5_000_000;

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
  if (xml.length > MAX_XML) throw new HttpError(413, 'Flowchart มีขนาดใหญ่เกินกำหนด', 'TOO_LARGE');
  let png: string | null = null;
  if (body.png !== undefined && body.png !== null && body.png !== '') {
    if (typeof body.png !== 'string' || !PNG_DATA_RE.test(body.png)) throw badRequest('ภาพตัวอย่างต้องเป็นไฟล์ PNG');
    if (body.png.length > MAX_PNG) throw new HttpError(413, 'ภาพตัวอย่าง Flowchart มีขนาดใหญ่เกินกำหนด', 'TOO_LARGE');
    png = body.png;
  }

  const db = await getDb();
  return db.tx(async (q) => {
    await lockDraft(q, user, sopId, versionId);
    const { rows } = await q.query<Diagram>(
      `insert into sop_diagrams (version_id, block_id, xml_source, preview_png_data, updated_by)
       values ($1, $2, $3, $4, $5)
       on conflict (version_id, block_id)
       do update set xml_source = excluded.xml_source, preview_png_data = excluded.preview_png_data,
                     updated_by = excluded.updated_by, updated_at = now()
       returning block_id, xml_source, preview_png_data, updated_at`,
      [versionId, blockId, xml, png, user.id],
    );
    await q.query(`update sop_versions set updated_at = now(), updated_by = $2 where id = $1`, [versionId, user.id]);
    await q.query(`update sops set updated_at = now() where id = $1`, [sopId]);
    await audit(q, { actor: user.id, sop: sopId, version: versionId, type: 'DIAGRAM_SAVED', meta: { block_id: blockId } });
    return rows[0];
  });
}

// ═══ New revision from the published version ═══════════════════════════

export async function createRevision(user: AuthUser, sopId: string): Promise<{ versionId: string }> {
  const db = await getDb();
  return db.tx(async (q) => {
    const sopRes = await q.query(`select id, owner_id, published_version_id from sops where id = $1 for update`, [sopId]);
    const sop = sopRes.rows[0];
    if (!sop) throw notFound('ไม่พบ SOP นี้');
    if (!canAuthorSop(user, sop)) throw forbidden('เฉพาะเจ้าของเอกสารหรือผู้ดูแลระบบที่สร้างฉบับแก้ไขได้');
    if (!sop.published_version_id) throw conflict('SOP นี้ยังไม่มีฉบับเผยแพร่', 'NOT_PUBLISHED');
    const activeRes = await q.query(`select id from sop_versions where sop_id = $1 and state = any($2::text[])`, [
      sopId,
      ACTIVE_STATES,
    ]);
    if (activeRes.rows[0]) {
      throw conflict('SOP นี้มีฉบับร่างหรือฉบับที่รอพิจารณาอยู่แล้ว', 'ACTIVE_EXISTS');
    }
    const { rows } = await q.query(
      `insert into sop_versions (sop_id, revision_no, state, title, content_json, content_text,
                                 based_on_version_id, created_by, updated_by)
       select p.sop_id, (select max(revision_no) + 1 from sop_versions where sop_id = p.sop_id), 'DRAFT',
              p.title, p.content_json, p.content_text, p.id, $2, $2
         from sop_versions p where p.id = $1
       returning id, revision_no`,
      [sop.published_version_id, user.id],
    );
    const newId: string = rows[0].id;
    await q.query(
      `insert into sop_diagrams (version_id, block_id, xml_source, preview_png_data, updated_by)
       select $1, block_id, xml_source, preview_png_data, $3 from sop_diagrams where version_id = $2`,
      [newId, sop.published_version_id, user.id],
    );
    await q.query(`update sops set updated_at = now() where id = $1`, [sopId]);
    const label = await q.query(`select version_label from sop_versions where id = $1`, [sop.published_version_id]);
    await audit(q, {
      actor: user.id,
      sop: sopId,
      version: newId,
      type: 'REVISION_CREATED',
      meta: { from_label: label.rows[0]?.version_label, revision_no: rows[0].revision_no },
    });
    return { versionId: newId };
  });
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
  return db.tx(async (q) => {
    const { version } = await lockDraft(q, user, sopId, versionId);
    const textRes = await q.query(`select length(trim(content_text)) as n from sop_versions where id = $1`, [versionId]);
    if (!Number(textRes.rows[0]?.n)) throw badRequest('กรุณาเพิ่มเนื้อหาก่อนส่งตรวจ');

    const people = await q.query(`select id, role from app_users where id = any($1::uuid[]) and is_active`, [
      [reviewerId, approverId],
    ]);
    const reviewer = people.rows.find((u) => u.id === reviewerId);
    const approver = people.rows.find((u) => u.id === approverId);
    if (!reviewer || !(REVIEWER_ROLES as readonly string[]).includes(reviewer.role)) {
      throw badRequest('ผู้ตรวจทานต้องมีบทบาท Reviewer, Approver หรือ Admin และยังใช้งานอยู่');
    }
    if (!approver || !(APPROVER_ROLES as readonly string[]).includes(approver.role)) {
      throw badRequest('ผู้อนุมัติต้องมีบทบาท Approver หรือ Admin และยังใช้งานอยู่');
    }

    const att = await q.query(`select coalesce(max(attempt_no), 0) + 1 as n from approval_steps where version_id = $1`, [
      versionId,
    ]);
    const attempt = Number(att.rows[0].n);
    await q.query(
      `insert into approval_steps (version_id, attempt_no, step_no, step_type, assignee_id, state)
       values ($1, $2, 1, 'REVIEW', $3, 'PENDING'), ($1, $2, 2, 'APPROVE', $4, 'WAITING')`,
      [versionId, attempt, reviewerId, approverId],
    );
    await q.query(
      `update sop_versions
          set state = 'IN_REVIEW', submitted_at = now(), change_note = $2, major_change = $3,
              row_version = row_version + 1, updated_at = now(), updated_by = $4
        where id = $1`,
      [versionId, changeNote, majorChange, user.id],
    );
    await q.query(`update sops set updated_at = now() where id = $1`, [sopId]);
    await audit(q, {
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
  return db.tx(async (q) => {
    const peek = await q.query(
      `select v.sop_id from approval_steps st join sop_versions v on v.id = st.version_id where st.id = $1`,
      [stepId],
    );
    if (!peek.rows[0]) throw notFound('ไม่พบรายการพิจารณานี้');
    const sopId: string = peek.rows[0].sop_id;

    // Every workflow write locks the SOP row first, so decisions on one SOP are serialized.
    const sopRes = await q.query(`select id, published_version_id from sops where id = $1 for update`, [sopId]);
    const sop = sopRes.rows[0];
    const stepRes = await q.query(`select * from approval_steps where id = $1 for update`, [stepId]);
    const step = stepRes.rows[0];
    const vRes = await q.query(
      `select id, state, revision_no, title, major_change from sop_versions where id = $1 for update`,
      [step.version_id],
    );
    const version = vRes.rows[0];

    const adminOverride = step.assignee_id !== user.id;
    if (adminOverride && user.role !== 'ADMIN') throw forbidden('รายการนี้ไม่ได้มอบหมายให้คุณ');
    if (step.state !== 'PENDING') throw conflict('รายการนี้ได้รับการพิจารณาไปแล้ว', 'ALREADY_DECIDED');
    const expected = step.step_no === 1 ? 'IN_REVIEW' : 'IN_APPROVAL';
    if (version.state !== expected) throw conflict('สถานะเอกสารเปลี่ยนไปแล้ว กรุณาโหลดใหม่', 'STATE_CHANGED');

    const meta = { attempt_no: step.attempt_no, revision_no: version.revision_no, comment, admin_override: adminOverride };
    await q.query(
      `update approval_steps set state = $2, comment = $3, decided_by = $4, decided_at = now() where id = $1`,
      [stepId, decision === 'APPROVE' ? 'APPROVED' : 'REJECTED', comment, user.id],
    );

    if (decision === 'REJECT') {
      await q.query(
        `update approval_steps set state = 'CANCELLED'
          where version_id = $1 and attempt_no = $2 and id <> $3 and state in ('WAITING', 'PENDING')`,
        [version.id, step.attempt_no, stepId],
      );
      await q.query(
        `update sop_versions set state = 'DRAFT', row_version = row_version + 1, updated_at = now() where id = $1`,
        [version.id],
      );
      await q.query(`update sops set updated_at = now() where id = $1`, [sopId]);
      await audit(q, {
        actor: user.id,
        sop: sopId,
        version: version.id,
        type: step.step_no === 1 ? 'REVIEW_REJECTED' : 'APPROVAL_REJECTED',
        meta,
      });
      return { state: 'DRAFT' as VersionState };
    }

    if (step.step_no === 1) {
      await q.query(
        `update approval_steps set state = 'PENDING'
          where version_id = $1 and attempt_no = $2 and step_no = 2 and state = 'WAITING'`,
        [version.id, step.attempt_no],
      );
      await q.query(`update sop_versions set state = 'IN_APPROVAL', updated_at = now() where id = $1`, [version.id]);
      await q.query(`update sops set updated_at = now() where id = $1`, [sopId]);
      await audit(q, { actor: user.id, sop: sopId, version: version.id, type: 'REVIEW_APPROVED', meta });
      return { state: 'IN_APPROVAL' as VersionState };
    }

    // Final approval → publish: supersede the old version, publish the new one and move the pointer.
    let oldLabel: string | null = null;
    if (sop.published_version_id) {
      const old = await q.query(
        `update sop_versions set state = 'SUPERSEDED', superseded_at = now()
          where id = $1 and state = 'PUBLISHED'
          returning version_label`,
        [sop.published_version_id],
      );
      oldLabel = old.rows[0]?.version_label ?? null;
    }
    const label = nextLabel(oldLabel, version.major_change);
    await q.query(
      `update sop_versions
          set state = 'PUBLISHED', version_label = $2, published_at = now(), published_by = $3,
              effective_date = (now() at time zone 'Asia/Bangkok')::date, updated_at = now()
        where id = $1`,
      [version.id, label, user.id],
    );
    await q.query(`update sops set published_version_id = $2, title = $3, updated_at = now() where id = $1`, [
      sopId,
      version.id,
      version.title,
    ]);
    await audit(q, { actor: user.id, sop: sopId, version: version.id, type: 'PUBLISHED', meta: { ...meta, label } });
    if (sop.published_version_id) {
      await audit(q, {
        actor: user.id,
        sop: sopId,
        version: sop.published_version_id,
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
  const { rows } = await db.query(
    `select st.id as step_id, st.step_no, st.step_type, st.attempt_no, (st.assignee_id = $1) as assigned_to_me,
            ${userRef('a')} as assignee,
            s.id as sop_id, s.code, v.id as version_id, v.revision_no, v.title, v.submitted_at,
            v.major_change, v.change_note, pv.version_label as current_label,
            ${userRef('o')} as author,
            (select c.name from sop_category_links l join sop_categories c on c.id = l.category_id
              where l.sop_id = s.id order by c.sort_order limit 1) as category
       from approval_steps st
       join app_users a on a.id = st.assignee_id
       join sop_versions v on v.id = st.version_id
       join sops s on s.id = v.sop_id
       join app_users o on o.id = s.owner_id
       left join sop_versions pv on pv.id = s.published_version_id
      where st.state = 'PENDING' and ($2 or st.assignee_id = $1)
      order by (st.assignee_id = $1) desc, v.submitted_at asc`,
    [user.id, allForAdmin],
  );
  const steps = await loadSteps(
    db,
    rows.map((r) => r.version_id),
  );
  return rows.map((r) => {
    const forVersion = steps.filter((s) => s.version_id === r.version_id).map(({ version_id: _, ...s }) => s);
    return {
      ...r,
      steps: forVersion.filter((s) => s.attempt_no === r.attempt_no),
      history: forVersion.filter((s) => s.attempt_no < r.attempt_no && s.state === 'REJECTED'),
    };
  });
}

export async function pendingCount(user: AuthUser): Promise<number> {
  const db = await getDb();
  const { rows } = await db.query(
    `select count(*)::int as n from approval_steps where assignee_id = $1 and state = 'PENDING'`,
    [user.id],
  );
  return rows[0].n;
}

export async function dashboard(user: AuthUser): Promise<DashboardData> {
  const db = await getDb();
  const all = await listSops(user, { orderBy: 'recent' });
  const cats = await db.query(`select count(*)::int as n from sop_categories`);
  const count = (state: VersionState) => all.filter((s) => s.active?.state === state).length;
  const published = all.filter((s) => s.published).length;
  return {
    stats: {
      accessible: all.length,
      published,
      drafts: count('DRAFT'),
      pending: count('IN_REVIEW') + count('IN_APPROVAL'),
      categories: cats.rows[0].n,
    },
    pipeline: {
      DRAFT: count('DRAFT'),
      IN_REVIEW: count('IN_REVIEW'),
      IN_APPROVAL: count('IN_APPROVAL'),
      PUBLISHED: published,
    },
    recent: all.slice(0, 6),
    tasks: await listApprovals(user, { mineOnly: true }),
  };
}
