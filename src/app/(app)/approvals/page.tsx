'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { useDialog } from '@/components/Dialogs';
import { IconArrowRight, IconCheck, IconUndoArrow } from '@/components/icons';
import { ErrorBox, Spinner } from '@/components/ui';
import { useApi } from '@/lib/client/useApi';
import { STEP_TYPE_LABEL, displayName, fmtDateTime } from '@/lib/shared/labels';
import type { ApprovalTask } from '@/lib/shared/types';

export default function ApprovalsPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Approvals />
    </Suspense>
  );
}

function Approvals() {
  const { me } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const { data, error, loading, reload } = useApi<{ tasks: ApprovalTask[] }>('/api/approvals');
  const tasks = data?.tasks ?? [];
  const [result, setResult] = useState<{ text: string; ok: boolean } | null>(null);
  const wanted = params.get('step');
  const selected = tasks.find((t) => t.step_id === wanted) ?? tasks[0] ?? null;

  return (
    <>
      <header className="page-header">
        <div className="titles">
          <h1>คิวตรวจ / อนุมัติ</h1>
          <p className="sub">
            เอกสารที่ได้รับมอบหมายให้คุณพิจารณา
            {me?.role === 'ADMIN' && ' (ผู้ดูแลระบบเห็นงานของทุกคน)'}
          </p>
        </div>
      </header>

      {error && <ErrorBox error={error} onRetry={reload} />}
      {result && (
        <div className={`alert ${result.ok ? 'alert-success' : 'alert-warn'}`} role="status">
          {result.text}
        </div>
      )}
      {loading && !data ? (
        <Spinner />
      ) : tasks.length === 0 ? (
        <div className="card empty">
          <IconCheck size={28} style={{ color: 'var(--success)', margin: '0 auto' }} />
          <span>ไม่มีเอกสารรอการพิจารณา</span>
        </div>
      ) : (
        <div className="row-wrap">
          <section aria-label="รายการงาน" className="task-list">
            {tasks.map((t) => (
              <button
                key={t.step_id}
                type="button"
                className="task-item"
                aria-pressed={selected?.step_id === t.step_id}
                onClick={() => {
                  setResult(null);
                  router.replace(`/approvals?step=${t.step_id}`, { scroll: false });
                }}
              >
                <span className="top">
                  <span className="code">{t.code}</span>
                  <span className={`chip ${t.step_type === 'REVIEW' ? 'chip-review' : 'chip-approval'}`}>
                    {STEP_TYPE_LABEL[t.step_type]}
                  </span>
                </span>
                <span className="title">{t.title}</span>
                <span className="small muted">
                  ส่งครั้งที่ {t.attempt_no} · ขั้นที่ {t.step_no} จาก 2
                  {!t.assigned_to_me && ` · มอบหมายให้ ${displayName(t.assignee)}`}
                </span>
              </button>
            ))}
          </section>
          {selected && (
            <DecisionPanel
              key={selected.step_id}
              task={selected}
              onDecided={(text, ok) => {
                setResult({ text, ok });
                router.replace('/approvals', { scroll: false });
                reload();
              }}
            />
          )}
        </div>
      )}
    </>
  );
}

function DecisionPanel({ task, onDecided }: { task: ApprovalTask; onDecided: (text: string, ok: boolean) => void }) {
  const { api, refreshMe } = useAuth();
  const dialog = useDialog();
  const [reason, setReason] = useState('');
  const [showError, setShowError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isApprove = task.step_type === 'APPROVE';

  async function decide(decision: 'APPROVE' | 'REJECT') {
    setError(null);
    if (decision === 'REJECT' && !reason.trim()) {
      setShowError(true);
      return;
    }
    if (
      decision === 'APPROVE' &&
      isApprove &&
      !(await dialog.confirm({
        title: `อนุมัติและเผยแพร่ ${task.code}?`,
        message: 'เอกสารจะเผยแพร่ให้พนักงานใช้งานทันที และฉบับเผยแพร่เดิม (ถ้ามี) จะถูกแทนที่',
        confirmLabel: 'อนุมัติและเผยแพร่',
      }))
    ) {
      return;
    }
    setBusy(true);
    try {
      const r = await api<{ state: string; label?: string }>(`/api/approvals/${task.step_id}/decision`, {
        method: 'POST',
        json: { decision, comment: reason.trim() },
      });
      void refreshMe();
      if (decision === 'REJECT') onDecided(`${task.code}: ส่งกลับเป็นฉบับร่างพร้อมเหตุผลแล้ว`, false);
      else if (r.state === 'PUBLISHED') onDecided(`${task.code}: อนุมัติแล้ว — เผยแพร่เป็นเวอร์ชัน ${r.label}`, true);
      else onDecided(`${task.code}: ผ่านการตรวจแล้ว — ส่งต่อให้ผู้อนุมัติ`, true);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const reviewStep = task.steps.find((s) => s.step_no === 1);
  const approveStep = task.steps.find((s) => s.step_no === 2);

  return (
    <section aria-label="พิจารณาเอกสาร" className="card decision-panel" style={{ padding: '24px 28px', gap: 20 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)' }}>
            {task.code} · ฉบับร่าง r{task.revision_no}
            {task.current_label && ` (แก้ไขจาก ${task.current_label})`}
          </span>
          <h2 style={{ fontSize: 21, fontWeight: 700 }}>{task.title}</h2>
          <span className="small muted">
            หมวด {task.category ?? '—'} · ผู้เขียน {displayName(task.author)} · ส่งเมื่อ {fmtDateTime(task.submitted_at)}
          </span>
        </div>
        <Link href={`/sops/${task.sop_id}?version=${task.version_id}`} className="btn btn-secondary btn-sm" style={{ height: 40 }}>
          เปิดอ่านเอกสาร
        </Link>
      </div>

      <div className="steps">
        <span className={`step-pill ${reviewStep?.state === 'APPROVED' ? 'done' : task.step_no === 1 ? 'current' : ''}`}>
          1 · ตรวจทาน {task.step_no === 1 && task.assigned_to_me ? '(คุณ)' : displayName(reviewStep?.assignee)}
        </span>
        <IconArrowRight size={16} style={{ color: 'var(--faint)' }} />
        <span className={`step-pill ${task.step_no === 2 ? 'current' : ''}`}>
          2 · อนุมัติ {task.step_no === 2 && task.assigned_to_me ? '(คุณ)' : displayName(approveStep?.assignee)}
        </span>
        <IconArrowRight size={16} style={{ color: 'var(--faint)' }} />
        <span className="step-pill">เผยแพร่</span>
      </div>

      {(task.change_note || task.major_change) && (
        <div className="history-box">
          <span className="h">สรุปการเปลี่ยนแปลงจากผู้เขียน</span>
          {task.change_note && <span>{task.change_note}</span>}
          {task.major_change && <span className="chip chip-approval" style={{ alignSelf: 'flex-start' }}>เปลี่ยนแปลงสาระสำคัญ (ขึ้นเลขหลักใหม่)</span>}
        </div>
      )}

      {(task.history.length > 0 || reviewStep?.state === 'APPROVED') && (
        <div className="history-box">
          <span className="h">ประวัติการพิจารณา</span>
          {task.history.map((h) => (
            <span key={h.id}>
              ครั้งที่ {h.attempt_no} · {STEP_TYPE_LABEL[h.step_type]} · ไม่ผ่าน ({displayName(h.decided_by)}) — {h.comment}
            </span>
          ))}
          {reviewStep?.state === 'APPROVED' && (
            <span>
              ครั้งที่ {task.attempt_no} · ตรวจทาน · ผ่าน ({displayName(reviewStep.decided_by)})
              {reviewStep.comment ? ` — ${reviewStep.comment}` : ''}
            </span>
          )}
        </div>
      )}

      {!task.assigned_to_me && (
        <div className="alert alert-warn small">
          งานนี้มอบหมายให้ {displayName(task.assignee)} — การตัดสินใจแทนในฐานะผู้ดูแลระบบจะถูกบันทึกใน Audit log
        </div>
      )}

      <label className="field">
        ความเห็น / เหตุผล
        <textarea
          className="textarea"
          rows={4}
          value={reason}
          maxLength={2000}
          aria-invalid={showError}
          onChange={(e) => {
            setReason(e.target.value);
            setShowError(false);
          }}
          placeholder="ต้องระบุเหตุผลเมื่อส่งกลับแก้ไข"
        />
      </label>
      {showError && (
        <p role="alert" className="field-error" style={{ marginTop: -8 }}>
          กรุณาระบุเหตุผลก่อนส่งกลับแก้ไข
        </p>
      )}
      {error && <div className="alert alert-error">{error}</div>}

      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 10 }}>
        <button type="button" className="btn btn-secondary" style={{ height: 46 }} disabled={busy} onClick={() => decide('REJECT')}>
          <IconUndoArrow size={18} />
          ส่งกลับแก้ไข
        </button>
        <button type="button" className="btn btn-primary" style={{ height: 46 }} disabled={busy} onClick={() => decide('APPROVE')}>
          <IconCheck size={18} />
          {isApprove ? 'อนุมัติและเผยแพร่' : 'ผ่านการตรวจ'}
        </button>
      </div>
    </section>
  );
}
