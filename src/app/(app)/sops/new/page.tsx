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
  const [code, setCode] = useState('SOP-');
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allowed = me?.role === 'ADMIN' || me?.role === 'AUTHOR';
  const codeValid = /^[A-Z0-9][A-Z0-9-]{1,39}$/.test(code);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!codeValid) {
      setError('รหัส SOP ใช้ได้เฉพาะ A-Z, 0-9 และ - เช่น SOP-WH-003');
      return;
    }
    setBusy(true);
    try {
      const { id } = await api<{ id: string }>('/api/sops', {
        method: 'POST',
        json: { code, title, categoryId: categoryId || null },
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
        <label className="field">
          รหัส SOP
          <input
            className="input"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s+/g, '-'))}
            placeholder="SOP-WH-003"
            maxLength={40}
            required
            aria-invalid={code.length > 4 && !codeValid}
            style={{ fontWeight: 600, letterSpacing: '0.02em' }}
          />
          <span className="hint">ห้ามซ้ำกับ SOP อื่น · ใช้ได้เฉพาะ A-Z, 0-9 และขีด (-) · แนะนำรูปแบบ SOP-แผนก-ลำดับ</span>
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
        <label className="field">
          หมวดหมู่
          <select className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">— ไม่ระบุ —</option>
            {cats.data?.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
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
          <button type="submit" className="btn btn-primary" disabled={busy || !title.trim()}>
            {busy ? 'กำลังสร้าง…' : 'สร้างและเริ่มเขียน'}
          </button>
        </div>
      </form>
    </>
  );
}
