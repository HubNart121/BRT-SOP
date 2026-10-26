'use client';

import Link from 'next/link';
import { useRef, useState, type FormEvent } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { useDialog } from '@/components/Dialogs';
import { IconFolder, IconPencil, IconPlus, IconSave, IconTrash } from '@/components/icons';
import { ErrorBox, Spinner, useToast } from '@/components/ui';
import { useApi } from '@/lib/client/useApi';
import type { Category } from '@/lib/shared/types';

/** Ids of `id` and every category below it (they cannot become its parent). */
function selfAndDescendants(cats: Category[], id: string): Set<string> {
  const out = new Set([id]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const c of cats) {
      if (c.parent_id && out.has(c.parent_id) && !out.has(c.id)) {
        out.add(c.id);
        grew = true;
      }
    }
  }
  return out;
}

export default function CategoriesPage() {
  const { me, api } = useAuth();
  const toast = useToast();
  const dialog = useDialog();
  const { data, error, loading, reload } = useApi<{ categories: Category[] }>('/api/categories');
  const isAdmin = me?.role === 'ADMIN';
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [parentId, setParentId] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const cats = data?.categories ?? [];
  const byId = new Map(cats.map((c) => [c.id, c]));
  const blockedParents = editing ? selfAndDescendants(cats, editing.id) : new Set<string>();

  function resetForm() {
    setEditing(null);
    setName('');
    setSlug('');
    setParentId('');
    setFormError(null);
  }

  function startEdit(c: Category) {
    setEditing(c);
    setName(c.name);
    setSlug(c.slug);
    setParentId(c.parent_id ?? '');
    setFormError(null);
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    nameRef.current?.focus({ preventScroll: true });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setBusy(true);
    try {
      const json = { name, slug, parent_id: parentId || null };
      if (editing) {
        await api(`/api/categories/${editing.id}`, { method: 'PATCH', json });
        toast.show(`บันทึกหมวด “${name}” แล้ว`);
      } else {
        await api('/api/categories', { method: 'POST', json });
        toast.show(`เพิ่มหมวด “${name}” แล้ว`);
      }
      resetForm();
      reload();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(c: Category) {
    const children = cats.filter((x) => x.parent_id === c.id);
    if (children.length > 0) {
      toast.show(`ลบ “${c.name}” ไม่ได้ — มีหมวดย่อย ${children.length} หมวด กรุณาย้ายหรือลบหมวดย่อยก่อน`, 'error');
      return;
    }
    const targets = cats.filter((x) => x.id !== c.id);
    let moveTo = '';
    const ok = await dialog.confirm({
      title: `ลบหมวด “${c.name}”?`,
      message:
        c.sop_count === 0 ? (
          'หมวดนี้ยังไม่มี SOP · การลบย้อนกลับไม่ได้'
        ) : (
          <>
            {`มี SOP ในหมวดนี้ ${c.sop_count} ฉบับ — เลือกหมวดที่จะย้าย SOP ไป (ไม่กระทบเนื้อหาหรือเวอร์ชันของ SOP)`}
            <label className="field" style={{ marginTop: 12, color: 'var(--text)' }}>
              ย้าย SOP ไปที่
              <select className="select" defaultValue="" onChange={(e) => (moveTo = e.target.value)}>
                <option value="">— ไม่มีหมวด —</option>
                {targets.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        ),
      confirmLabel: 'ลบหมวดหมู่',
      danger: true,
    });
    if (!ok) return;
    try {
      const r = await api<{ moved: number }>(`/api/categories/${c.id}`, {
        method: 'DELETE',
        json: c.sop_count > 0 ? { move_to: moveTo || null } : {},
      });
      const dest = moveTo ? `“${byId.get(moveTo)?.name}”` : '“ไม่มีหมวด”';
      toast.show(r.moved > 0 ? `ลบหมวด “${c.name}” แล้ว · ย้าย SOP ${r.moved} ฉบับไป ${dest}` : `ลบหมวด “${c.name}” แล้ว`);
      if (editing?.id === c.id) resetForm();
      reload();
    } catch (err) {
      toast.show((err as Error).message, 'error');
      reload();
    }
  }

  return (
    <>
      <header className="page-header">
        <div className="titles">
          <h1>หมวดหมู่</h1>
          <p className="sub">จัดกลุ่ม SOP ตามฝ่ายงาน เพื่อให้ค้นหาและกรองได้ง่าย</p>
        </div>
      </header>

      {error && <ErrorBox error={error} onRetry={reload} />}
      <div className="row-wrap">
        <section className="card" style={{ flex: '2 1 520px' }}>
          <h2>หมวดหมู่ทั้งหมด</h2>
          {loading && !data ? (
            <Spinner />
          ) : cats.length === 0 ? (
            <p className="empty">ยังไม่มีหมวดหมู่</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>ชื่อหมวด</th>
                    <th className="hide-mobile">รหัสหมวด</th>
                    <th className="hide-mobile">หมวดหลัก</th>
                    <th style={{ textAlign: 'right' }}>จำนวน SOP</th>
                    {isAdmin && <th />}
                  </tr>
                </thead>
                <tbody>
                  {cats.map((c) => (
                    <tr key={c.id} style={editing?.id === c.id ? { background: 'var(--surface-2)' } : undefined}>
                      <td>
                        <Link href={`/sops?category=${c.id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
                          <IconFolder size={18} style={{ flexShrink: 0 }} />
                          {c.name}
                        </Link>
                        <div className="only-mobile small muted" style={{ marginTop: 2, paddingLeft: 26 }}>
                          {c.slug}
                          {c.parent_id && ` · ใต้ ${byId.get(c.parent_id)?.name ?? '—'}`}
                        </div>
                      </td>
                      <td className="muted hide-mobile">{c.slug}</td>
                      <td className="muted hide-mobile">{c.parent_id ? byId.get(c.parent_id)?.name ?? '—' : '—'}</td>
                      <td style={{ textAlign: 'right' }}>{c.sop_count}</td>
                      {isAdmin && (
                        <td>
                          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => startEdit(c)}
                              aria-label={`แก้ไขหมวด ${c.name}`}
                              title="แก้ไข"
                            >
                              <IconPencil size={16} />
                              <span className="hide-mobile hide-tablet">แก้ไข</span>
                            </button>
                            <button
                              type="button"
                              className="btn btn-danger btn-sm"
                              onClick={() => void remove(c)}
                              aria-label={`ลบหมวด ${c.name}`}
                              title="ลบ"
                            >
                              <IconTrash size={16} />
                              <span className="hide-mobile hide-tablet">ลบ</span>
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {isAdmin && (
          <form ref={formRef} className="card" style={{ flex: '1 1 300px' }} onSubmit={submit}>
            <h2>{editing ? `แก้ไขหมวด “${editing.name}”` : 'เพิ่มหมวดหมู่'}</h2>
            <label className="field">
              ชื่อหมวด
              <input ref={nameRef} className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required placeholder="เช่น บัญชีและการเงิน" />
            </label>
            <label className="field">
              รหัสหมวด
              <input
                className="input"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                maxLength={40}
                required
                placeholder="เช่น finance"
              />
              <span className="hint">ภาษาอังกฤษตัวเล็ก ตัวเลข และ - เท่านั้น ห้ามซ้ำ</span>
            </label>
            <label className="field">
              หมวดหลัก <span className="hint">(ไม่บังคับ)</span>
              <select className="select" value={parentId} onChange={(e) => setParentId(e.target.value)}>
                <option value="">— ไม่มี —</option>
                {cats
                  .filter((c) => !blockedParents.has(c.id))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </label>
            {formError && <div className="alert alert-error">{formError}</div>}
            <button type="submit" className="btn btn-primary" disabled={busy || !name.trim() || !slug}>
              {editing ? <IconSave size={18} /> : <IconPlus size={18} />}
              {editing ? (busy ? 'กำลังบันทึก…' : 'บันทึกการแก้ไข') : busy ? 'กำลังเพิ่ม…' : 'เพิ่มหมวดหมู่'}
            </button>
            {editing && (
              <button type="button" className="btn btn-secondary" onClick={resetForm} disabled={busy}>
                ยกเลิก
              </button>
            )}
          </form>
        )}
      </div>
      {toast.node}
    </>
  );
}
