'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { IconFolder, IconPlus } from '@/components/icons';
import { ErrorBox, Spinner, useToast } from '@/components/ui';
import { useApi } from '@/lib/client/useApi';
import type { Category } from '@/lib/shared/types';

export default function CategoriesPage() {
  const { me, api } = useAuth();
  const toast = useToast();
  const { data, error, loading, reload } = useApi<{ categories: Category[] }>('/api/categories');
  const isAdmin = me?.role === 'ADMIN';
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [parentId, setParentId] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const cats = data?.categories ?? [];
  const byId = new Map(cats.map((c) => [c.id, c]));

  async function add(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setBusy(true);
    try {
      await api('/api/categories', { method: 'POST', json: { name, slug, parent_id: parentId || null } });
      toast.show(`เพิ่มหมวด “${name}” แล้ว`);
      setName('');
      setSlug('');
      setParentId('');
      reload();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setBusy(false);
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
        <section className="card" style={{ flex: '2 1 420px' }}>
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
                    <th>รหัสหมวด</th>
                    <th>หมวดหลัก</th>
                    <th style={{ textAlign: 'right' }}>จำนวน SOP</th>
                  </tr>
                </thead>
                <tbody>
                  {cats.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <Link href={`/sops?category=${c.id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
                          <IconFolder size={18} />
                          {c.name}
                        </Link>
                      </td>
                      <td className="muted">{c.slug}</td>
                      <td className="muted">{c.parent_id ? byId.get(c.parent_id)?.name ?? '—' : '—'}</td>
                      <td style={{ textAlign: 'right' }}>{c.sop_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {isAdmin && (
          <form className="card" style={{ flex: '1 1 300px' }} onSubmit={add}>
            <h2>เพิ่มหมวดหมู่</h2>
            <label className="field">
              ชื่อหมวด
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required placeholder="เช่น บัญชีและการเงิน" />
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
                {cats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            {formError && <div className="alert alert-error">{formError}</div>}
            <button type="submit" className="btn btn-primary" disabled={busy || !name.trim() || !slug}>
              <IconPlus size={18} />
              {busy ? 'กำลังเพิ่ม…' : 'เพิ่มหมวดหมู่'}
            </button>
          </form>
        )}
      </div>
      {toast.node}
    </>
  );
}
