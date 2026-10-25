'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { IconArrowRight, IconChevronRight, IconPlus, IconSearch } from '@/components/icons';
import { ErrorBox, Spinner, StateChip, sopStatus } from '@/components/ui';
import { useApi } from '@/lib/client/useApi';
import { STEP_TYPE_LABEL } from '@/lib/shared/labels';
import type { DashboardData } from '@/lib/shared/types';

const STAGES = [
  { key: 'DRAFT', label: 'ฉบับร่าง', bg: 'var(--chip-draft-bg)', fg: 'var(--chip-draft-fg)', en: 'DRAFT' },
  { key: 'IN_REVIEW', label: 'รอผู้ตรวจ', bg: 'var(--chip-review-bg)', fg: 'var(--chip-review-fg)', en: 'IN REVIEW' },
  { key: 'IN_APPROVAL', label: 'รอผู้อนุมัติ', bg: 'var(--chip-approval-bg)', fg: 'var(--chip-approval-fg)', en: 'IN APPROVAL' },
  { key: 'PUBLISHED', label: 'เผยแพร่แล้ว', bg: 'var(--chip-published-bg)', fg: 'var(--chip-published-fg)', en: 'PUBLISHED' },
] as const;

export default function DashboardPage() {
  const { me } = useAuth();
  const router = useRouter();
  const { data, error, loading, reload } = useApi<DashboardData>('/api/dashboard');
  const [q, setQ] = useState('');
  const canAuthor = me?.role === 'ADMIN' || me?.role === 'AUTHOR';

  function search(e: FormEvent) {
    e.preventDefault();
    router.push(q.trim() ? `/sops?q=${encodeURIComponent(q.trim())}` : '/sops');
  }

  return (
    <>
      <header className="page-header">
        <div className="titles">
          <span className="only-mobile muted small">สวัสดี, {me?.full_name || me?.email}</span>
          <h1>แดชบอร์ด</h1>
          <p className="sub hide-mobile">ภาพรวมคู่มือการปฏิบัติงานของ Blue Ribbon Trading</p>
        </div>
        <div className="actions" style={{ flex: '1 1 auto', justifyContent: 'flex-end' }}>
          <form onSubmit={search} role="search" style={{ flex: '1 1 280px', maxWidth: 360 }}>
            <label className="search-box" style={{ background: 'var(--surface)', height: 44 }}>
              <IconSearch size={18} style={{ color: 'var(--muted)' }} />
              <span className="sr-only">ค้นหา SOP</span>
              <input type="search" placeholder="ค้นหารหัสหรือชื่อ SOP…" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
          </form>
          {canAuthor && (
            <Link href="/sops/new" className="btn btn-primary hide-mobile">
              <IconPlus size={18} />
              สร้าง SOP ใหม่
            </Link>
          )}
        </div>
      </header>

      {error && <ErrorBox error={error} onRetry={reload} />}
      {loading && !data && <Spinner />}

      {data && (
        <>
          <section aria-label="สรุปสถานะ" className="stat-grid">
            <div className="stat">
              <span className="label">SOP ที่เข้าถึงได้</span>
              <span className="value">{data.stats.accessible}</span>
              <span className="foot">{data.stats.categories} หมวดหมู่</span>
            </div>
            <div className="stat">
              <span className="label">เผยแพร่แล้ว</span>
              <span className="value" style={{ color: 'var(--success)' }}>
                {data.stats.published}
              </span>
              <span className="foot">ฉบับที่พนักงานใช้งานได้</span>
            </div>
            <div className="stat">
              <span className="label">ฉบับร่าง</span>
              <span className="value" style={{ color: 'var(--text-2)' }}>
                {data.stats.drafts}
              </span>
              <span className="foot">กำลังแก้ไข</span>
            </div>
            <div className="stat">
              <span className="label">รอตรวจ / อนุมัติ</span>
              <span className="value" style={{ color: '#B4530A' }}>
                {data.stats.pending}
              </span>
              <span className="foot">รอการพิจารณา</span>
            </div>
          </section>

          <section className="card" aria-label="เส้นทางเอกสาร">
            <h2>เส้นทางเอกสาร</h2>
            <div className="pipeline">
              {STAGES.map((s, i) => (
                <div key={s.key} style={{ display: 'contents' }}>
                  {i > 0 && (
                    <span className="arrow">
                      <IconArrowRight size={20} />
                    </span>
                  )}
                  <div className="stage" style={{ background: s.bg }}>
                    <span className="k" style={{ color: s.fg }}>
                      {s.en}
                    </span>
                    <span className="v">
                      {s.label} · {data.pipeline[s.key]}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div className="row-wrap">
            <section className="card" style={{ flex: '2 1 520px' }}>
              <div className="card-head">
                <h2>อัปเดตล่าสุด</h2>
                <Link href="/sops" style={{ fontSize: 14, fontWeight: 600 }}>
                  ดูทั้งหมด
                </Link>
              </div>
              {data.recent.length === 0 ? (
                <p className="empty">ยังไม่มี SOP ที่คุณเข้าถึงได้</p>
              ) : (
                <div className="table-wrap">
                  <table className="table" style={{ minWidth: 520 }}>
                    <thead>
                      <tr>
                        <th>รหัส</th>
                        <th>ชื่อเอกสาร</th>
                        <th>เวอร์ชัน</th>
                        <th>สถานะ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recent.map((s) => {
                        const st = sopStatus(s);
                        return (
                          <tr key={s.id}>
                            <td className="code">
                              <Link href={`/sops/${s.id}`}>{s.code}</Link>
                            </td>
                            <td>
                              <Link href={`/sops/${s.id}`} style={{ color: 'inherit' }}>
                                {s.title}
                              </Link>
                            </td>
                            <td style={{ whiteSpace: 'nowrap' }}>{st.version}</td>
                            <td>
                              <StateChip state={st.state}>{st.label}</StateChip>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="card" style={{ flex: '1 1 300px' }}>
              <h2>งานที่รอคุณพิจารณา</h2>
              {data.tasks.length === 0 && <p className="muted small">ไม่มีงานค้าง</p>}
              {data.tasks.map((t) => (
                <Link
                  key={t.step_id}
                  href={`/approvals?step=${t.step_id}`}
                  className={`task${t.step_type === 'APPROVE' ? ' approve' : ''}`}
                >
                  <span className="kicker">
                    {STEP_TYPE_LABEL[t.step_type]} · ขั้นที่ {t.step_no} จาก 2
                  </span>
                  <span style={{ fontSize: 15, fontWeight: 600 }}>{t.code}</span>
                  <span style={{ fontSize: 14, color: 'var(--text-2)' }}>{t.title}</span>
                  <span className="btn btn-outline btn-sm" style={{ alignSelf: 'flex-start', marginTop: 4 }}>
                    เปิดพิจารณา
                    <IconChevronRight size={16} />
                  </span>
                </Link>
              ))}
              <p className="muted small">แสดงเฉพาะงานที่ได้รับมอบหมายให้คุณ</p>
            </section>
          </div>
        </>
      )}
    </>
  );
}
