'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { ControlledDocument, waitForAssets, type ControlledDoc } from '@/components/ControlledDocument';
import { IconPrinter } from '@/components/icons';
import { RequireAuth } from '@/components/RequireAuth';
import { ErrorBox, Spinner } from '@/components/ui';
import { useApi } from '@/lib/client/useApi';
import { displayName, fmtDate, versionName } from '@/lib/shared/labels';
import type { SopDetail } from '@/lib/shared/types';

export default function PrintPage() {
  return (
    <RequireAuth>
      <Suspense fallback={<Spinner />}>
        <PrintView />
      </Suspense>
    </RequireAuth>
  );
}

function PrintView() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const version = params.get('version');
  const auto = params.get('auto') !== '0';
  const { data, error, reload } = useApi<SopDetail>(`/api/sops/${id}${version ? `?version=${version}` : ''}`);
  const [ready, setReady] = useState(false);
  const printed = useRef(false);
  const body = useRef<HTMLDivElement>(null);

  const doc = useMemo<ControlledDoc | null>(() => {
    if (!data) return null;
    const { sop, version: v } = data;
    const lastAttempt = v.steps.reduce((n, s) => Math.max(n, s.attempt_no), 0);
    const approved = (no: number) =>
      v.steps.find((s) => s.attempt_no === lastAttempt && s.step_no === no && s.state === 'APPROVED');
    const review = approved(1);
    const approve = approved(2);
    return {
      code: sop.code,
      title: v.title,
      versionLabel: v.version_label,
      revisionNo: v.revision_no,
      state: v.state,
      effectiveDate: v.effective_date,
      content: v.content_json,
      diagrams: Object.fromEntries(v.diagrams.map((d) => [d.block_id, d])),
      preparedBy: displayName(sop.owner),
      reviewed: review ? { name: displayName(review.decided_by), at: review.decided_at } : null,
      approved: approve
        ? { name: displayName(approve.decided_by), at: approve.decided_at }
        : v.published_by
          ? { name: displayName(v.published_by), at: v.published_at }
          : null,
    };
  }, [data]);

  // Wait for fonts + diagram images before opening the print dialog.
  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      await waitForAssets(body.current);
      if (cancelled) return;
      setReady(true);
      if (auto && !printed.current) {
        printed.current = true;
        window.print();
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [doc, auto]);

  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <ErrorBox error={error} onRetry={reload} />
      </div>
    );
  }
  if (!data || !doc) return <Spinner />;
  const { sop, version: v } = data;

  return (
    <div style={{ background: '#fff', minHeight: '100vh' }}>
      <title>{`${sop.code} ${v.title} (${versionName(v)})`}</title>
      <div className="print-toolbar no-print">
        <Link href={`/sops/${sop.id}?version=${v.id}`} className="btn btn-secondary btn-sm">
          ← กลับไปที่เอกสาร
        </Link>
        <span className="small muted hide-mobile">เลือกปลายทาง “บันทึกเป็น PDF” ในหน้าต่างพิมพ์ · ขนาด A4</span>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => window.print()} disabled={!ready}>
          <IconPrinter size={16} />
          พิมพ์ / บันทึก PDF
        </button>
      </div>
      <ControlledDocument
        ref={body}
        doc={doc}
        footer={
          <p className="small muted" style={{ marginTop: 12 }}>
            พิมพ์จาก BRT SOP Center เมื่อ {fmtDate(new Date().toISOString())} — ตรวจสอบฉบับล่าสุดในระบบก่อนใช้งานทุกครั้ง
          </p>
        }
      />
    </div>
  );
}
