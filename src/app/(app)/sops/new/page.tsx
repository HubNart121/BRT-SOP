'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { ErrorBox } from '@/components/ui';
import { useApi } from '@/lib/client/useApi';
import type { Category } from '@/lib/shared/types';

export default function NewSopPage() {
  const { me, api } = useAuth();
  const router = useRouter();
  const cats = useApi<{ categories: Category[] }>('/api/categories');
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The code is issued by the server (SOP-<category code>-<running number>); this is only a preview.
  const next = useApi<{ code: string }>(categoryId ? `/api/sops/next-code?category=${categoryId}` : null);

  const allowed = me?.role === 'ADMIN' || me?.role === 'AUTHOR';
  const noCategories = cats.data?.categories.length === 0;
  const codePreview = !categoryId ? '' : next.loading ? 'กำลังออกรหัส…' : (next.data?.code ?? '');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!categoryId) {
      setError('กรุณาเลือกหมวดหมู่ — รหัส SOP ออกตามหมวด');
      return;
    }
    setBusy(true);
    try {
      const { id } = await api<{ id: string; code: string }>('/api/sops', {
        method: 'POST',
        json: { title, categoryId },
      });
      router.push(`/sops/${id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  if (!allowed) {
    return <ErrorBox error="เฉพาะผู้เขียน (Author) หรือผู้ดูแลระบบที่สร้าง SOP ได้" />;
  }

  return (
    <>
      <header className="page-header">
        <div className="titles">
          <div className="breadcrumb">
            <Link href="/sops">คลังคู่มือ SOP</Link>
            <span aria-hidden="true">/</span>
            <span>สร้างใหม่</span>
          </div>
          <h1>สร้าง SOP ใหม่</h1>
          <p className="sub">ระบบจะสร้างฉบับร่าง r1 พร้อมโครงหัวข้อมาตรฐาน แล้วเปิดหน้าแก้ไขให้ทันที</p>
        </div>
      </header>

      <form className="card" style={{ maxWidth: 640, gap: 20 }} onSubmit={submit}>
        {noCategories && (
          <div className="alert alert-warn" role="alert">
            ยังไม่มีหมวดหมู่ — รหัส SOP ออกตามหมวด จึงต้องมีหมวดก่อน
            {me?.role === 'ADMIN' ? (
              <>
                {' '}
                <Link href="/categories">เพิ่มหมวดหมู่</Link>
              </>
            ) : (
              ' กรุณาติดต่อผู้ดูแลระบบ'
            )}
          </div>
        )}
        <label className="field">
          หมวดหมู่
          <select className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
            <option value="">— เลือกหมวดหมู่ —</option>
            {cats.data?.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          รหัส SOP
          <input
            className="input"
            value={codePreview}
            readOnly
            tabIndex={-1}
            placeholder="เลือกหมวดหมู่ก่อน ระบบจะออกรหัสให้"
            style={{ fontWeight: 600, letterSpacing: '0.02em', background: 'var(--surface-2)', cursor: 'default' }}
          />
          {next.error ? (
            <span className="field-error">{next.error}</span>
          ) : (
            <span className="hint">ระบบออกรหัสให้อัตโนมัติ (SOP-รหัสหมวด-ลำดับ) · แก้ไขไม่ได้ · เลขจริงยืนยันตอนกดสร้าง</span>
          )}
        </label>
        <label className="field">
          ชื่อเอกสาร
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="เช่น ตรวจนับสต็อกประจำเดือน"
            maxLength={200}
            required
          />
        </label>
        {error && (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <Link href="/sops" className="btn btn-secondary">
            ยกเลิก
          </Link>
          <button type="submit" className="btn btn-primary" disabled={busy || !title.trim() || !categoryId}>
            {busy ? 'กำลังสร้าง…' : 'สร้างและเริ่มเขียน'}
          </button>
        </div>
      </form>
    </>
  );
}
