'use client';

import { useParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ControlledDocument, waitForAssets, type ControlledDoc } from '@/components/ControlledDocument';
import { IconPrinter } from '@/components/icons';
import { Spinner } from '@/components/ui';
import { fmtDateTime } from '@/lib/shared/labels';
import type { SharedSop } from '@/lib/shared/types';

/** PUBLIC page — no login. Shows the published SOP behind a share link until the link expires. */
export default function SharedSopPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<SharedSop | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [ready, setReady] = useState(false);
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/share/${encodeURIComponent(token)}`, { cache: 'no-store', referrerPolicy: 'no-referrer' })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || 'ไม่สามารถเปิดเอกสารได้');
        return d as SharedSop;
      })
      .then((d) => !cancelled && setData(d))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Hide the content as soon as the link expires, even if the page stays open.
  useEffect(() => {
    if (!data) return;
    const check = () => {
      if (Date.now() >= new Date(data.expires_at).getTime()) setExpired(true);
    };
    check();
    const t = setInterval(check, 15_000);
    return () => clearInterval(t);
  }, [data]);

  useEffect(() => {
    if (!data || expired) return;
    void waitForAssets(body.current).then(() => setReady(true));
  }, [data, expired]);

  const doc = useMemo<ControlledDoc | null>(
    () =>
      data && {
        code: data.code,
        title: data.title,
        versionLabel: data.version_label,
        revisionNo: data.revision_no,
        state: 'PUBLISHED',
        effectiveDate: data.effective_date,
        content: data.content_json,
        diagrams: Object.fromEntries(
          data.diagrams.map((d) => [d.block_id, { ...d, xml_source: '', updated_at: '' }]),
        ),
        preparedBy: data.prepared_by,
        reviewed: data.reviewed,
        approved: data.approved,
      },
    [data],
  );

  if (error || expired) {
    return (
      <div className="share-shell">
        <ShareBar />
        <div className="share-gone">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-icon.png" alt="" width={56} height={62} />
          <h1>ไม่สามารถเปิดเอกสารนี้ได้</h1>
          <p className="muted">{expired ? 'ลิงก์นี้หมดอายุแล้ว' : error}</p>
          <p className="muted small">กรุณาติดต่อผู้ที่ส่งลิงก์ให้คุณเพื่อขอลิงก์ใหม่</p>
        </div>
      </div>
    );
  }
  if (!data || !doc) return <Spinner label="กำลังเปิดเอกสาร…" />;

  return (
    <div className="share-shell">
      <title>{`${data.code} ${data.title} (${data.version_label})`}</title>
      <ShareBar>
        <span className="small muted hide-mobile">ดูได้ถึง {fmtDateTime(data.expires_at)}</span>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => window.print()} disabled={!ready}>
          <IconPrinter size={16} />
          <span className="hide-mobile">พิมพ์ / PDF</span>
        </button>
      </ShareBar>
      <div className="share-notice no-print">
        เอกสารนี้แชร์จาก BRT SOP Center แบบอ่านอย่างเดียว · ฉบับเผยแพร่ล่าสุด · ลิงก์ใช้ได้ถึง {fmtDateTime(data.expires_at)}
      </div>
      <ControlledDocument
        ref={body}
        doc={doc}
        footer={
          <p className="small muted" style={{ marginTop: 12 }}>
            เอกสารควบคุมของ Blue Ribbon Trading — สำเนาที่พิมพ์ออกไปไม่ได้รับการปรับปรุงอัตโนมัติ
          </p>
        }
      />
    </div>
  );
}

function ShareBar({ children }: { children?: React.ReactNode }) {
  return (
    <header className="share-bar no-print">
      <span className="brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo-icon.png" alt="" width={28} height={31} />
        <span>
          <b>BRT</b> SOP Center
        </span>
      </span>
      <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>{children}</span>
    </header>
  );
}
