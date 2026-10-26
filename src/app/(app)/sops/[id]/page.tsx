'use client';

import type { Editor } from '@tiptap/react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { useDialog } from '@/components/Dialogs';
import { DrawioModal } from '@/components/editor/DrawioModal';
import { SopEditor } from '@/components/editor/SopEditor';
import { IconCheckSquare, IconHistory, IconLink, IconPencil, IconPrinter, IconSave, IconSend } from '@/components/icons';
import { ShareDialog } from '@/components/ShareDialog';
import { ErrorBox, Spinner, StateChip, useToast } from '@/components/ui';
import { useApi } from '@/lib/client/useApi';
import {
  AUDIT_LABEL,
  STATE_LABEL,
  STEP_STATE_LABEL,
  STEP_TYPE_LABEL,
  displayName,
  fmtDate,
  fmtDateTime,
  versionName,
} from '@/lib/shared/labels';
import type { ApprovalStep, Category, Diagram, SopDetail, TiptapDoc } from '@/lib/shared/types';

export default function SopPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <SopLoader />
    </Suspense>
  );
}

function SopLoader() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const version = params.get('version');
  const { data, error, reload } = useApi<SopDetail>(`/api/sops/${id}${version ? `?version=${version}` : ''}`);

  if (error && !data) {
    return (
      <>
        <div className="breadcrumb">
          <Link href="/sops">คลังคู่มือ SOP</Link>
        </div>
        <ErrorBox error={error} onRetry={reload} />
      </>
    );
  }
  if (!data) return <Spinner />;
  return <SopDocument key={data.version.id} detail={data} reload={reload} />;
}

function SopDocument({ detail, reload }: { detail: SopDetail; reload: () => void }) {
  const { api, refreshMe } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const dialog = useDialog();
  const { sop, version: v, versions, permissions } = detail;
  const editable = permissions.canEdit;

  const [title, setTitle] = useState(v.title);
  const [categoryId, setCategoryId] = useState(sop.category?.id ?? '');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedOnce, setSavedOnce] = useState(false);
  const [diagrams, setDiagrams] = useState<Record<string, Diagram>>(() =>
    Object.fromEntries(v.diagrams.map((d) => [d.block_id, d])),
  );
  const [modal, setModal] = useState<{ blockId: string; xml: string | null; isNew: boolean } | null>(null);
  const [sharing, setSharing] = useState(false);

  const editorRef = useRef<Editor | null>(null);
  const rowVersion = useRef(v.row_version);
  const changes = useRef(0);
  const diagramsRef = useRef(diagrams);
  diagramsRef.current = diagrams;

  const cats = useApi<{ categories: Category[] }>(editable ? '/api/categories' : null);

  const markDirty = useCallback(() => {
    changes.current += 1;
    setDirty(true);
  }, []);
  const onReady = useCallback((e: Editor | null) => {
    editorRef.current = e;
  }, []);

  const save = useCallback(
    async (silent = false): Promise<boolean> => {
      const editor = editorRef.current;
      if (!editor || !editable) return false;
      if (!title.trim()) {
        toast.show('กรุณาระบุชื่อเอกสาร', 'error');
        return false;
      }
      const startedAt = changes.current;
      setSaving(true);
      try {
        const r = await api<{ row_version: number }>(`/api/sops/${sop.id}/versions/${v.id}`, {
          method: 'PATCH',
          json: {
            title: title.trim(),
            content: editor.getJSON() as TiptapDoc,
            categoryId: categoryId || null,
            rowVersion: rowVersion.current,
          },
        });
        rowVersion.current = r.row_version;
        setDirty(changes.current !== startedAt);
        setSavedOnce(true);
        if (!silent) toast.show('บันทึกฉบับร่างแล้ว');
        return true;
      } catch (err) {
        toast.show((err as Error).message, 'error');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [api, categoryId, editable, sop.id, title, toast, v.id],
  );

  // Ctrl/Cmd + S and leave-page warning
  useEffect(() => {
    if (!editable) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void save();
      }
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [dirty, editable, save]);

  const openDiagram = useCallback((blockId: string) => {
    const existing = diagramsRef.current[blockId];
    setModal({ blockId, xml: existing?.xml_source ?? null, isNew: !existing });
  }, []);

  const saveDiagram = useCallback(
    async (xml: string, png: string | null) => {
      if (!modal) return;
      const r = await api<{ diagram: Diagram }>(
        `/api/sops/${sop.id}/versions/${v.id}/diagrams/${modal.blockId}`,
        { method: 'PUT', json: { xml, png } },
      );
      setDiagrams((d) => ({ ...d, [modal.blockId]: r.diagram }));
      setModal((m) => (m ? { ...m, xml, isNew: false } : m));
      // Persist the draft too, so the saved content references this diagram block.
      await save(true);
    },
    [api, modal, save, sop.id, v.id],
  );

  const closeDiagram = useCallback(() => {
    // A newly inserted block that was never saved is removed again.
    if (modal?.isNew && !diagramsRef.current[modal.blockId]) {
      const editor = editorRef.current;
      if (editor) {
        const { state } = editor;
        let range: { from: number; to: number } | null = null;
        state.doc.descendants((node, pos) => {
          if (node.type.name === 'drawio' && node.attrs.blockId === modal.blockId) {
            range = { from: pos, to: pos + node.nodeSize };
            return false;
          }
          return true;
        });
        if (range) editor.chain().deleteRange(range).run();
      }
    }
    setModal(null);
  }, [modal]);

  async function createRevision() {
    const yes = await dialog.confirm({
      title: 'สร้างฉบับแก้ไขใหม่?',
      message:
        'ระบบจะคัดลอกเนื้อหาจากฉบับเผยแพร่ปัจจุบันเป็นฉบับร่าง ฉบับเผยแพร่จะยังใช้งานได้ตามปกติจนกว่าฉบับใหม่จะได้รับอนุมัติ',
      confirmLabel: 'สร้างฉบับร่าง',
    });
    if (!yes) return;
    try {
      await api(`/api/sops/${sop.id}/revisions`, { method: 'POST' });
      toast.show('สร้างฉบับร่างใหม่แล้ว');
      router.replace(`/sops/${sop.id}`);
      reload();
    } catch (err) {
      toast.show((err as Error).message, 'error');
    }
  }

  const published = versions.find((x) => x.state === 'PUBLISHED');
  const lastAttempt = v.steps.reduce((n, s) => Math.max(n, s.attempt_no), 0);
  const currentSteps = v.steps.filter((s) => s.attempt_no === lastAttempt);
  const rejection = v.state === 'DRAFT' ? currentSteps.find((s) => s.state === 'REJECTED') : undefined;
  const pastRejections = v.steps.filter((s) => s.state === 'REJECTED' && s !== rejection);

  return (
    <>
      <header className="page-header" style={{ alignItems: 'flex-end' }}>
        <div className="titles" style={{ gap: 8 }}>
          <div className="breadcrumb">
            <Link href="/sops">คลังคู่มือ SOP</Link>
            <span aria-hidden="true">/</span>
            <span>{sop.code}</span>
          </div>
          <div className="doc-title-row">
            <h1>{editable ? title || 'ไม่มีชื่อ' : v.title}</h1>
            <StateChip state={v.state}>
              {STATE_LABEL[v.state]} {versionName(v)}
            </StateChip>
            {editable && dirty && <span className="chip chip-review">ยังไม่บันทึก</span>}
          </div>
          <span className="muted small">
            {v.state === 'PUBLISHED' &&
              `มีผลตั้งแต่ ${fmtDate(v.effective_date)} · อนุมัติโดย ${displayName(v.published_by)}`}
            {v.state === 'SUPERSEDED' && `ฉบับเก่า — ถูกแทนที่เมื่อ ${fmtDate(v.superseded_at)}`}
            {['DRAFT', 'IN_REVIEW', 'IN_APPROVAL'].includes(v.state) &&
              (v.based_on_label
                ? `แก้ไขจากฉบับเผยแพร่ ${v.based_on_label} · ฉบับเผยแพร่ยังใช้งานได้ตามปกติจนกว่าฉบับนี้จะได้รับอนุมัติ`
                : 'ฉบับแรก — ยังไม่เคยเผยแพร่')}
          </span>
        </div>
        <div className="actions">
          <a
            className="btn btn-secondary"
            href={`/print/sops/${sop.id}?version=${v.id}`}
            target="_blank"
            rel="noopener"
            onClick={(e) => {
              if (dirty) {
                e.preventDefault();
                toast.show('กรุณาบันทึกร่างก่อนส่งออก PDF', 'error');
              }
            }}
          >
            <IconPrinter size={18} />
            ส่งออก PDF
          </a>
          {permissions.canShare && (
            <button type="button" className="btn btn-secondary" onClick={() => setSharing(true)}>
              <IconLink size={18} />
              แชร์ลิงก์
            </button>
          )}
          {editable && (
            <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={saving || (!dirty && savedOnce)}>
              <IconSave size={18} />
              {saving ? 'กำลังบันทึก…' : !dirty && savedOnce ? 'บันทึกแล้ว' : 'บันทึกร่าง'}
            </button>
          )}
          {permissions.canCreateRevision && v.state === 'PUBLISHED' && (
            <button type="button" className="btn btn-outline" onClick={createRevision}>
              <IconPencil size={18} />
              แก้ไข (สร้างฉบับร่างใหม่)
            </button>
          )}
        </div>
      </header>

      {permissions.pendingStepId && (
        <div className="banner warn">
          <IconCheckSquare size={20} />
          <span className="grow">เอกสารนี้รอการพิจารณาจากคุณ</span>
          <Link href={`/approvals?step=${permissions.pendingStepId}`} className="btn btn-outline btn-sm">
            เปิดพิจารณา
          </Link>
        </div>
      )}
      {rejection && (
        <div className="banner warn" role="status">
          <span className="grow">
            <strong>ถูกส่งกลับแก้ไข</strong> โดย {displayName(rejection.decided_by)} ({STEP_TYPE_LABEL[rejection.step_type]}) ·{' '}
            {fmtDateTime(rejection.decided_at)}
            <br />
            เหตุผล: {rejection.comment}
          </span>
        </div>
      )}
      {(v.state === 'IN_REVIEW' || v.state === 'IN_APPROVAL') && !permissions.pendingStepId && (
        <div className="banner info">
          <span className="grow">เอกสารอยู่ระหว่างการพิจารณา — แก้ไขไม่ได้จนกว่าจะได้รับอนุมัติหรือถูกส่งกลับแก้ไข</span>
        </div>
      )}
      {v.state === 'SUPERSEDED' && (
        <div className="banner old">
          <IconHistory size={20} />
          <span className="grow">คุณกำลังดูฉบับเก่าที่ถูกแทนที่แล้ว ไม่ใช่ฉบับที่ใช้งานปัจจุบัน</span>
          {published && (
            <Link href={`/sops/${sop.id}?version=${published.id}`} className="btn btn-secondary btn-sm">
              ไปที่ฉบับปัจจุบัน {published.version_label}
            </Link>
          )}
        </div>
      )}

      <div className="row-wrap">
        <section className="editor-card col-main" aria-label="เนื้อหา SOP">
          {editable && (
            <input
              className="title-input"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                markDirty();
              }}
              maxLength={200}
              aria-label="ชื่อเอกสาร"
              placeholder="ชื่อเอกสาร"
            />
          )}
          <SopEditor
            content={v.content_json}
            editable={editable}
            diagrams={diagrams}
            onChange={markDirty}
            onEditDiagram={openDiagram}
            onReady={onReady}
          />
        </section>

        <aside className="col-side">
          <section className="card">
            <h2>ข้อมูลเอกสาร</h2>
            <dl className="dl">
              <dt>รหัส</dt>
              <dd style={{ fontWeight: 600 }}>{sop.code}</dd>
              <dt>หมวดหมู่</dt>
              <dd>
                {editable ? (
                  <select
                    className="select"
                    style={{ height: 38 }}
                    value={categoryId}
                    onChange={(e) => {
                      setCategoryId(e.target.value);
                      markDirty();
                    }}
                    aria-label="หมวดหมู่"
                  >
                    <option value="">— ไม่ระบุ —</option>
                    {cats.data?.categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  sop.category?.name ?? '—'
                )}
                {editable && categoryId !== (sop.category?.id ?? '') && (
                  <span className="hint" style={{ display: 'block', marginTop: 4 }}>
                    รหัส {sop.code} คงเดิม (รหัส SOP ไม่เปลี่ยนตามหมวด)
                  </span>
                )}
              </dd>
              <dt>เจ้าของ</dt>
              <dd>{displayName(sop.owner)}</dd>
              <dt>ฉบับเผยแพร่</dt>
              <dd>{published ? `${published.version_label} (${fmtDate(published.effective_date)})` : '—'}</dd>
              <dt>เวอร์ชันนี้</dt>
              <dd>
                {versionName(v)} · {STATE_LABEL[v.state]}
              </dd>
              <dt>แก้ไขล่าสุด</dt>
              <dd>{fmtDateTime(v.updated_at)}</dd>
            </dl>
          </section>

          {permissions.canSubmit && detail.assignees && (
            <SubmitPanel
              detail={detail}
              hasPublished={!!published}
              beforeSubmit={async () => (dirty ? save(true) : true)}
              onDone={() => {
                toast.show('ส่งตรวจแล้ว');
                void refreshMe();
                reload();
              }}
              onError={(m) => toast.show(m, 'error')}
            />
          )}

          {currentSteps.length > 0 && !rejection && (
            <section className="card">
              <h2>สถานะการพิจารณา</h2>
              <StepChain steps={currentSteps} />
              {v.change_note && (
                <p className="small">
                  <span className="muted">สรุปการเปลี่ยนแปลง: </span>
                  {v.change_note}
                </p>
              )}
            </section>
          )}

          {(pastRejections.length > 0 || rejection) && (
            <section className="card">
              <h2>ประวัติการพิจารณา</h2>
              <ul className="timeline">
                {v.steps
                  .filter((s) => s.state === 'APPROVED' || s.state === 'REJECTED')
                  .map((s) => (
                    <li key={s.id}>
                      <span className={`dot${s.state === 'APPROVED' ? ' published' : ' review'}`} />
                      <span className="body">
                        <span className="t">
                          ครั้งที่ {s.attempt_no} · {STEP_TYPE_LABEL[s.step_type]} · {STEP_STATE_LABEL[s.state]}
                        </span>
                        <span className="s">
                          {displayName(s.decided_by)} · {fmtDateTime(s.decided_at)}
                        </span>
                        {s.comment && <span className="small">“{s.comment}”</span>}
                      </span>
                    </li>
                  ))}
              </ul>
            </section>
          )}

          <section className="card">
            <h2>ประวัติเวอร์ชัน</h2>
            <ol className="timeline">
              {versions.map((x) => {
                const isCurrent = x.id === v.id;
                const dot =
                  x.state === 'PUBLISHED'
                    ? 'published'
                    : x.state === 'SUPERSEDED'
                      ? 'hollow'
                      : x.state === 'DRAFT'
                        ? ''
                        : 'review';
                return (
                  <li key={x.id}>
                    <span className={`dot ${dot}${isCurrent ? ' current' : ''}`} />
                    <span className="body">
                      <span className="t" style={x.state === 'SUPERSEDED' ? { color: 'var(--text-2)' } : undefined}>
                        {versionName(x)} · {x.state === 'PUBLISHED' ? 'เผยแพร่ปัจจุบัน' : STATE_LABEL[x.state]}
                      </span>
                      <span className="s">
                        {x.published_at ? `อนุมัติ ${fmtDate(x.published_at)}` : `แก้ไข ${fmtDate(x.updated_at)}`}
                      </span>
                      {isCurrent ? (
                        <span className="small" style={{ color: 'var(--primary)', fontWeight: 600 }}>
                          กำลังแสดง
                        </span>
                      ) : (
                        <Link href={`/sops/${sop.id}?version=${x.id}`} className="small">
                          เปิดฉบับนี้
                        </Link>
                      )}
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>

          {detail.audit && detail.audit.length > 0 && (
            <section className="card">
              <h2>กิจกรรมล่าสุด</h2>
              <ul className="timeline">
                {detail.audit.slice(0, 12).map((e, i) => (
                  <li key={i}>
                    <span className="dot hollow" />
                    <span className="body">
                      <span className="t" style={{ fontWeight: 500 }}>
                        {AUDIT_LABEL[e.event_type] ?? e.event_type}
                        {e.revision_no ? ` · ${e.version_label ?? `r${e.revision_no}`}` : ''}
                      </span>
                      <span className="s">
                        {displayName(e.actor)} · {fmtDateTime(e.created_at)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>

      {modal && (
        <DrawioModal
          title={`${sop.code} — ${title || v.title}`}
          xml={modal.xml}
          onSave={saveDiagram}
          onClose={closeDiagram}
        />
      )}
      {sharing && (
        <ShareDialog
          sopId={sop.id}
          code={sop.code}
          publishedLabel={published?.version_label ?? null}
          onClose={() => {
            setSharing(false);
            reload();
          }}
        />
      )}
      {toast.node}
    </>
  );
}

function StepChain({ steps }: { steps: ApprovalStep[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {steps.map((s) => {
        const cls =
          s.state === 'APPROVED' ? 'done' : s.state === 'PENDING' ? 'current' : s.state === 'REJECTED' ? 'rejected' : '';
        return (
          <div key={s.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className={`step-pill ${cls}`} style={{ alignSelf: 'flex-start' }}>
              {s.step_no} · {STEP_TYPE_LABEL[s.step_type]} — {STEP_STATE_LABEL[s.state]}
            </span>
            <span className="small muted" style={{ paddingLeft: 4 }}>
              {displayName(s.assignee)}
              {s.decided_at ? ` · ${fmtDateTime(s.decided_at)}` : ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SubmitPanel({
  detail,
  hasPublished,
  beforeSubmit,
  onDone,
  onError,
}: {
  detail: SopDetail;
  hasPublished: boolean;
  beforeSubmit: () => Promise<boolean>;
  onDone: () => void;
  onError: (msg: string) => void;
}) {
  const { api } = useAuth();
  const assignees = detail.assignees!;
  const lastSteps = useMemo(() => {
    const max = detail.version.steps.reduce((n, s) => Math.max(n, s.attempt_no), 0);
    return detail.version.steps.filter((s) => s.attempt_no === max);
  }, [detail.version.steps]);
  const [reviewerId, setReviewerId] = useState(lastSteps.find((s) => s.step_no === 1)?.assignee.id ?? '');
  const [approverId, setApproverId] = useState(lastSteps.find((s) => s.step_no === 2)?.assignee.id ?? '');
  const [changeNote, setChangeNote] = useState(detail.version.change_note);
  const [major, setMajor] = useState(detail.version.major_change);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!reviewerId || !approverId) {
      onError('กรุณาเลือกผู้ตรวจทานและผู้อนุมัติ');
      return;
    }
    if (reviewerId === approverId) {
      onError('ผู้ตรวจทานและผู้อนุมัติต้องเป็นคนละคน');
      return;
    }
    setBusy(true);
    try {
      if (!(await beforeSubmit())) return;
      await api(`/api/sops/${detail.sop.id}/submit`, {
        method: 'POST',
        json: { versionId: detail.version.id, reviewerId, approverId, changeNote, majorChange: major },
      });
      onDone();
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const none = assignees.reviewers.length === 0 || assignees.approvers.length === 0;

  return (
    <form className="card" onSubmit={submit}>
      <h2>ส่งตรวจ</h2>
      {none && (
        <div className="alert alert-warn small">
          ยังไม่มีผู้ใช้ที่มีบทบาทผู้ตรวจทาน/ผู้อนุมัติ — ให้ผู้ดูแลระบบเพิ่มผู้ใช้ที่หน้า “ผู้ใช้งาน”
        </div>
      )}
      <label className="field">
        ผู้ตรวจทาน (Reviewer)
        <select className="select" value={reviewerId} onChange={(e) => setReviewerId(e.target.value)} required>
          <option value="">เลือกผู้ตรวจทาน</option>
          {assignees.reviewers.map((u) => (
            <option key={u.id} value={u.id}>
              {displayName(u)}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        ผู้อนุมัติ (Approver)
        <select className="select" value={approverId} onChange={(e) => setApproverId(e.target.value)} required>
          <option value="">เลือกผู้อนุมัติ</option>
          {assignees.approvers.map((u) => (
            <option key={u.id} value={u.id}>
              {displayName(u)}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        สรุปการเปลี่ยนแปลง <span className="hint">(ไม่บังคับ)</span>
        <textarea
          className="textarea"
          rows={2}
          maxLength={1000}
          value={changeNote}
          onChange={(e) => setChangeNote(e.target.value)}
          placeholder={hasPublished ? 'เช่น ปรับระยะเวลาตอบกลับลูกค้า' : 'เช่น จัดทำฉบับแรก'}
        />
      </label>
      {hasPublished && (
        <label className="checkbox">
          <input type="checkbox" checked={major} onChange={(e) => setMajor(e.target.checked)} />
          <span>
            เปลี่ยนแปลงสาระสำคัญ
            <span className="hint" style={{ display: 'block' }}>
              เลขเวอร์ชันจะขึ้นหลักใหม่ (เช่น 1.1 → 2.0)
            </span>
          </span>
        </label>
      )}
      <button type="submit" className="btn btn-accent" style={{ height: 46 }} disabled={busy || none}>
        <IconSend size={18} />
        {busy ? 'กำลังส่ง…' : 'ส่งตรวจ'}
      </button>
    </form>
  );
}
