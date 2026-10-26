'use client';

import { useState, type FormEvent } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { IconPlus } from '@/components/icons';
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

export default function UsersPage() {
  const { me, api } = useAuth();
  const toast = useToast();
  const { data, error, loading, reload, setData } = useApi<{ users: AppUserRow[] }>(me?.role === 'ADMIN' ? '/api/users' : null);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<Role>('VIEWER');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (me?.role !== 'ADMIN') return <ErrorBox error="หน้านี้สำหรับผู้ดูแลระบบเท่านั้น" />;

  async function invite(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setNotice(null);
    if (!isGmail(email)) {
      setFormError('เชิญได้เฉพาะอีเมล Gmail (@gmail.com)');
      return;
    }
    setBusy(true);
    try {
      const r = await api<{ user: AppUserRow }>('/api/users', {
        method: 'POST',
        json: { email, full_name: fullName, role },
      });
      setNotice(`เพิ่ม ${r.user.email} แล้ว — แจ้งผู้ใช้ให้กด “เข้าสู่ระบบด้วย Google” แล้วเลือกบัญชี Gmail นี้`);
      setEmail('');
      setFullName('');
      setRole('VIEWER');
      reload();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function update(u: AppUserRow, patch: Partial<Pick<AppUserRow, 'role' | 'is_active'>>) {
    try {
      const r = await api<{ user: AppUserRow }>(`/api/users/${u.id}`, { method: 'PATCH', json: patch });
      setData((d) => (d ? { users: d.users.map((x) => (x.id === u.id ? r.user : x)) } : d));
      toast.show('บันทึกแล้ว');
    } catch (err) {
      toast.show((err as Error).message, 'error');
      reload();
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
              <table className="table" style={{ minWidth: 640 }}>
                <thead>
                  <tr>
                    <th>ผู้ใช้</th>
                    <th>บทบาท</th>
                    <th>สถานะ</th>
                    <th>เข้าใช้ล่าสุด</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} style={u.is_active ? undefined : { opacity: 0.6 }}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span className="avatar" style={{ width: 34, height: 34, fontSize: 14 }}>
                            {initials(u.full_name, u.email)}
                          </span>
                          <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                            <strong style={{ fontWeight: 600 }}>{u.full_name || '—'}</strong>
                            <span className="small muted">{u.email}</span>
                          </span>
                        </div>
                      </td>
                      <td>
                        <select
                          className="select"
                          style={{ height: 38, minWidth: 140 }}
                          value={u.role}
                          disabled={u.id === me.id}
                          aria-label={`บทบาทของ ${u.email}`}
                          onChange={(e) => void update(u, { role: e.target.value as Role })}
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABEL[r]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <label className="checkbox" style={{ alignItems: 'center' }}>
                          <input
                            type="checkbox"
                            checked={u.is_active}
                            disabled={u.id === me.id}
                            onChange={(e) => void update(u, { is_active: e.target.checked })}
                          />
                          {u.is_active ? 'ใช้งาน' : 'ระงับ'}
                        </label>
                      </td>
                      <td className="small muted" style={{ whiteSpace: 'nowrap' }}>
                        {u.last_login_at ? fmtDateTime(u.last_login_at) : 'ยังไม่เคยเข้า'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <form className="card" style={{ flex: '1 1 300px' }} onSubmit={invite}>
          <h2>เชิญผู้ใช้ใหม่</h2>
          <label className="field">
            อีเมล
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="name@gmail.com" />
            <span className="hint">เฉพาะ Gmail — ผู้ใช้กดปุ่ม Google แล้วเลือกอีเมลนี้</span>
          </label>
          <label className="field">
            ชื่อ-นามสกุล
            <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} required maxLength={120} />
          </label>
          <label className="field">
            บทบาท
            <select className="select" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]} ({r})
                </option>
              ))}
            </select>
            <span className="hint">{ROLE_HELP[role]}</span>
          </label>
          {formError && <div className="alert alert-error">{formError}</div>}
          <button type="submit" className="btn btn-primary" disabled={busy}>
            <IconPlus size={18} />
            {busy ? 'กำลังเชิญ…' : 'เชิญผู้ใช้'}
          </button>
        </form>
      </div>
      {toast.node}
    </>
  );
}
