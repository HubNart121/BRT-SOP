'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { IconDoc, IconPlus, IconSearch } from '@/components/icons';
import { ErrorBox, Spinner, StateChip, sopStatus } from '@/components/ui';
import { useApi } from '@/lib/client/useApi';
import type { Category, SopListItem } from '@/lib/shared/types';

export default function LibraryPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Library />
    </Suspense>
  );
}

function Library() {
  const { me } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const q = params.get('q') ?? '';
  const cat = params.get('category') ?? '';
  const [text, setText] = useState(q);
  const canAuthor = me?.role === 'ADMIN' || me?.role === 'AUTHOR';

  const cats = useApi<{ categories: Category[] }>('/api/categories');
  const qs = new URLSearchParams();
  if (q) qs.set('q', q);
  if (cat) qs.set('category', cat);
  const list = useApi<{ sops: SopListItem[] }>(`/api/sops${qs.size ? `?${qs}` : ''}`);

  // Debounced search → URL (keeps searches shareable and back-button friendly)
  useEffect(() => {
    if (text.trim() === q) return;
    const t = setTimeout(() => setParam('q', text.trim()), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false });
  }

  const sops = list.data?.sops ?? [];

  return (
    <>
      <header className="page-header">
        <div className="titles">
          <h1>คลังคู่มือ SOP</h1>
          <p className="sub">ค้นหาด้วยรหัส ชื่อเรื่อง หรือข้อความในเนื้อหา</p>
        </div>
        {canAuthor && (
          <Link href="/sops/new" className="btn btn-primary hide-mobile">
            <IconPlus size={18} />
            สร้าง SOP ใหม่
          </Link>
        )}
      </header>

      <div className="card filter-panel" style={{ padding: '18px 20px' }}>
        <label className="search-box">
          <IconSearch size={20} style={{ color: 'var(--muted)' }} />
          <span className="sr-only">ค้นหา SOP</span>
          <input
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="เช่น SOP-WH, ใบเสนอราคา, ตรวจนับ…"
            autoFocus={!!q}
          />
        </label>
        <div className="chips-row" role="group" aria-label="กรองตามหมวดหมู่">
          <button type="button" className="filter-chip" aria-pressed={!cat} onClick={() => setParam('category', '')}>
            ทั้งหมด
          </button>
          {cats.data?.categories.map((c) => (
            <button
              key={c.id}
              type="button"
              className="filter-chip"
              aria-pressed={cat === c.id}
              onClick={() => setParam('category', cat === c.id ? '' : c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {list.error && <ErrorBox error={list.error} onRetry={list.reload} />}
      {list.loading && !list.data ? (
        <Spinner />
      ) : (
        <div className="sop-list" aria-busy={list.loading}>
          <span className="muted small" role="status">
            พบ {sops.length} รายการ
          </span>
          {sops.length === 0 && list.data && (
            <div className="card empty">
              ไม่พบ SOP ที่ตรงกับเงื่อนไข{q ? ` “${q}”` : ''}
              {canAuthor && !q && (
                <div style={{ marginTop: 12 }}>
                  <Link href="/sops/new" className="btn btn-outline btn-sm">
                    สร้าง SOP แรก
                  </Link>
                </div>
              )}
            </div>
          )}
          {sops.map((s) => {
            const st = sopStatus(s);
            return (
              <Link key={s.id} href={`/sops/${s.id}`} className="sop-row">
                <span className="doc-icon">
                  <IconDoc size={22} />
                </span>
                <span className="info">
                  <span className="code">{s.code}</span>
                  <span className="title">{s.title}</span>
                </span>
                <span className="meta">
                  {s.category && <span className="tag">{s.category.name}</span>}
                  <span className="ver">เวอร์ชัน {st.version}</span>
                  <StateChip state={st.state}>{st.label}</StateChip>
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
