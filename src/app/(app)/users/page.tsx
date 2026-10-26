'use client';

import { useRef, useState, type FormEvent } from 'react';
import { ApiError, useAuth } from '@/components/AuthProvider';
import { useDialog } from '@/components/Dialogs';
import { IconPencil, IconPlus, IconSave, IconTrash } from '@/components/icons';
import { ErrorBox, Spinner, initials, useToast } from '@/components/ui';
import { useApi } from '@/lib/client/useApi';
import { isGmail } from '@/lib/shared/email';
import { ROLE_LABEL, fmtDateTime } from '@/lib/shared/labels';
import { ROLES, type AppUserRow, type Role } from '@/lib/shared/types';

const ROLE_HELP: Record<Role, string> = {
  ADMIN: 'จัดการผู้ใช้ หมวดหมู่ และ SOP ทั้งหมด',
  AUTHOR: 'สร้างและแก้ไข SOP ของตนเอง ส่งตรวจได้',
  REVIEWER: 'ตรวจทานเอกสารที่ได้รับมอบหมาย',
  APPROVER: 'อนุมัติและเผยแพร่เอกสารที่ได้รับมอบหมาย',
  VIEWER: 'อ่านและพิมพ์ฉบับเผยแพร่',
};

/** The e-mail can only be corrected while the invite has not been used (no Google account linked yet). */
const emailEditable = (u: AppUserRow) => !u.firebase_linked && !u.last_login_at;

export default function UsersPage() {
  const { me, api } = useAuth();
  const toast = useToast();
  const dialog = useDialog();
  const { data, error, loading, reload } = useApi<{ users: AppUserRow[] }>(me?.role === 'ADMIN' ? '/api/users' : null);
  const [editing, setEditing] = useState<AppUserRow | null>(null);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<Role>('VIEWER');
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  if (me?.role !== 'ADMIN') return <ErrorBox error="หน้านี้สำหรับผู้ดูแลระบบเท่านั้น" />;

  const isSelf = editing?.id === me.id;
  const lockEmail = editing ? !emailEditable(editing) : false;

  function resetForm() {
    setEditing(null);
    setEmail('');
    setFullName('');
    setRole('VIEWER');
    setActive(true);
    setFormError(null);
  }

  function startEdit(u: AppUserRow) {
    setEditing(u);
    setEmail(u.email);
    setFullName(u.full_name);
    setRole(u.role);
    setActive(u.is_active);
    setFormError(null);
    setNotice(null);
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    nameRef.current?.focus({ preventScroll: true });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setNotice(null);
    if (!lockEmail && !isGmail(email)) {
      setFormError('ใช้ได้เฉพาะอีเมล Gmail (@gmail.com)');
      return;
    }
    setBusy(true);
    try {
      if (editing) {
        const patch: Record<string, unknown> = { full_name: fullName };
        if (!lockEmail && email.trim().toLowerCase() !== editing.email) patch.email = email;
        if (!isSelf) Object.assign(patch, { role, is_active: active });
        await api(`/api/users/${editing.id}`, { method: 'PATCH', json: patch });
        toast.show(`บันทึกข้อมูล ${fullName || email} แล้ว`);
      } else {
        const r = await api<{ user: AppUserRow }>('/api/users', {
          method: 'POST',
          json: { email, full_name: fullName, role },
        });
        setNotice(`เพิ่ม ${r.user.email} แล้ว — แจ้งผู้ใช้ให้กด “เข้าสู่ระบบด้วย Google” แล้วเลือกบัญชี Gmail นี้`);
      }
      resetForm();
      reload();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(u: AppUserRow) {
    const label = u.full_name || u.email;
    const ok = await dialog.confirm({
      title: `ลบผู้ใช้ “${label}”?`,
      message:
        `${u.email}\n\nลบได้เฉพาะผู้ใช้ที่ยังไม่มีประวัติในระบบ (เช่น เชิญผิดหรือยังไม่เคยใช้งาน) · ` +
        'ถ้าเคยเป็นเจ้าของ SOP ผู้ตรวจ/ผู้อนุมัติ หรือเคยทำรายการ ระบบจะให้ระงับการใช้งานแทนเพื่อเก็บประวัติ',
      confirmLabel: 'ลบผู้ใช้',
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/users/${u.id}`, { method: 'DELETE' });
      toast.show(`ลบผู้ใช้ ${label} แล้ว`);
      if (editing?.id === u.id) resetForm();
      reload();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'HAS_HISTORY' && u.is_active) {
        const suspend = await dialog.confirm({
          title: `ระงับการใช้งาน “${label}” แทน?`,
          message: `${err.message}\n\nผู้ใช้จะเข้าระบบไม่ได้ทันที แต่ประวัติทั้งหมดยังอยู่ และเปิดใช้งานกลับได้ภายหลัง`,
          confirmLabel: 'ระงับการใช้งาน',
          danger: true,
        });
        if (!suspend) return;
        try {
          await api(`/api/users/${u.id}`, { method: 'PATCH', json: { is_active: false } });
          toast.show(`ระงับการใช้งาน ${label} แล้ว`);
          if (editing?.id === u.id) resetForm();
          reload();
        } catch (e2) {
          toast.show((e2 as Error).message, 'error');
        }
        return;
      }
      toast.show((err as Error).message, 'error');
    }
  }

  const users = data?.users ?? [];

  return (
    <>
      <header className="page-header">
        <div className="titles">
          <h1>ผู้ใช้งาน</h1>
          <p className="sub">เชิญผู้ใช้ด้วยอีเมลและกำหนดบทบาท — สิทธิ์ทุกอย่างตรวจสอบที่เซิร์ฟเวอร์</p>
        </div>
      </header>

      {error && <ErrorBox error={error} onRetry={reload} />}
      {notice && (
        <div className="alert alert-info" role="status" style={{ whiteSpace: 'pre-line' }}>
          {notice}
        </div>
      )}

      <div className="row-wrap">
        <section className="card" style={{ flex: '3 1 560px' }}>
          <h2>ผู้ใช้ทั้งหมด ({users.length})</h2>
          {loading && !data ? (
            <Spinner />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>ผู้ใช้</th>
                    <th className="hide-mobile">บทบาท</th>
                    <th className="hide-mobile">สถานะ</th>
                    <th className="hide-mobile hide-tablet">เข้าใช้ล่าสุด</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const self = u.id === me.id;
                    const status = (
                      <span className={u.is_active ? 'chip chip-published' : 'chip chip-danger'}>{u.is_active ? 'ใช้งาน' : 'ระงับ'}</span>
                    );
                    return (
                      <tr
                        key={u.id}
                        style={{
                          ...(u.is_active ? {} : { opacity: 0.65 }),
                          ...(editing?.id === u.id ? { background: 'var(--surface-2)' } : {}),
                        }}
                      >
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span className="avatar hide-mobile" style={{ width: 34, height: 34, fontSize: 14, flexShrink: 0 }}>
                              {initials(u.full_name, u.email)}
                            </span>
                            <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                              <strong style={{ fontWeight: 600 }}>
                                {u.full_name || '—'}
                                {self && <span className="muted small"> (คุณ)</span>}
                              </strong>
                              <span className="small muted" style={{ overflowWrap: 'anywhere' }}>
                                {u.email}
                              </span>
                              <span className="only-mobile small" style={{ marginTop: 4, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                                <span className="tag">{ROLE_LABEL[u.role]}</span>
                                {status}
                              </span>
                            </span>
                          </div>
                        </td>
                        <td className="hide-mobile">
                          <span className="tag">{ROLE_LABEL[u.role]}</span>
                        </td>
                        <td className="hide-mobile">{status}</td>
                        <td className="small muted hide-mobile hide-tablet" style={{ whiteSpace: 'nowrap' }}>
                          {u.last_login_at ? fmtDateTime(u.last_login_at) : 'ยังไม่เคยเข้า'}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => startEdit(u)}
                              aria-label={`แก้ไขผู้ใช้ ${u.email}`}
                              title="แก้ไข"
                            >
                              <IconPencil size={16} />
                            </button>
                            <button
                              type="button"
                              className="btn btn-danger btn-sm"
                              onClick={() => void remove(u)}
                              disabled={self}
                              aria-label={`ลบผู้ใช้ ${u.email}`}
                              title={self ? 'ลบบัญชีของตนเองไม่ได้' : 'ลบ'}
                            >
                              <IconTrash size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <form ref={formRef} className="card" style={{ flex: '1 1 300px' }} onSubmit={submit}>
          <h2>{editing ? `แก้ไขผู้ใช้` : 'เชิญผู้ใช้ใหม่'}</h2>
          <label className="field">
            อีเมล
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              readOnly={lockEmail}
              placeholder="name@gmail.com"
              style={lockEmail ? { background: 'var(--surface-2)', cursor: 'default' } : undefined}
            />
            <span className="hint">
              {lockEmail
                ? 'ผู้ใช้นี้เข้าระบบด้วยบัญชี Google นี้แล้ว จึงเปลี่ยนอีเมลไม่ได้'
                : 'เฉพาะ Gmail — ผู้ใช้กดปุ่ม Google แล้วเลือกอีเมลนี้'}
            </span>
          </label>
          <label className="field">
            ชื่อ-นามสกุล
            <input ref={nameRef} className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} required maxLength={120} />
          </label>
          <label className="field">
            บทบาท
            <select className="select" value={role} onChange={(e) => setRole(e.target.value as Role)} disabled={isSelf}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]} ({r})
                </option>
              ))}
            </select>
            <span className="hint">{isSelf ? 'เปลี่ยนบทบาทของตนเองไม่ได้' : ROLE_HELP[role]}</span>
          </label>
          {editing && (
            <label className="checkbox" style={{ alignItems: 'center' }}>
              <input type="checkbox" checked={active} disabled={isSelf} onChange={(e) => setActive(e.target.checked)} />
              ใช้งานอยู่ {!active && <span className="muted small">— ระงับแล้ว เข้าระบบไม่ได้ (ประวัติยังอยู่)</span>}
            </label>
          )}
          {formError && <div className="alert alert-error">{formError}</div>}
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {editing ? <IconSave size={18} /> : <IconPlus size={18} />}
            {editing ? (busy ? 'กำลังบันทึก…' : 'บันทึกการแก้ไข') : busy ? 'กำลังเชิญ…' : 'เชิญผู้ใช้'}
          </button>
          {editing && (
            <button type="button" className="btn btn-secondary" onClick={resetForm} disabled={busy}>
              ยกเลิก
            </button>
          )}
        </form>
      </div>
      {toast.node}
    </>
  );
}
