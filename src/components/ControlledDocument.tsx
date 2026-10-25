'use client';

import { forwardRef, type ReactNode } from 'react';
import { STATE_LABEL, fmtDate } from '@/lib/shared/labels';
import type { Diagram, TiptapDoc, VersionState } from '@/lib/shared/types';
import { SopEditor } from './editor/SopEditor';

export interface ControlledDoc {
  code: string;
  title: string;
  versionLabel: string | null;
  revisionNo: number;
  state: VersionState;
  effectiveDate: string | null;
  content: TiptapDoc;
  diagrams: Record<string, Diagram>;
  preparedBy: string;
  reviewed: { name: string; at: string | null } | null;
  approved: { name: string; at: string | null } | null;
}

/**
 * A SOP laid out as a controlled document (A4): header block with code / version / effective date,
 * read-only content, sign-off boxes, and page numbers when printed. Used by the print and share pages.
 */
export const ControlledDocument = forwardRef<HTMLDivElement, { doc: ControlledDoc; footer?: ReactNode }>(
  function ControlledDocument({ doc, footer }, ref) {
    const isControlled = doc.state === 'PUBLISHED';
    const pageFooter = `${doc.code} · ${doc.versionLabel ? `เวอร์ชัน ${doc.versionLabel}` : `ฉบับร่าง r${doc.revisionNo}`}`;
    const pageCss = `@page { @bottom-left { content: "${pageFooter.replace(/["\\]/g, '')}"; font-size: 9pt; color: #5a6683; }
      @bottom-right { content: "หน้า " counter(page) " / " counter(pages); font-size: 9pt; color: #5a6683; } }`;

    return (
      <>
        <style>{pageCss}</style>
        {!isControlled && (
          <div className="print-watermark" aria-hidden="true">
            {doc.state === 'SUPERSEDED' ? 'ฉบับยกเลิก' : 'ฉบับร่าง'}
          </div>
        )}
        <div className="print-page" ref={ref}>
          <div className="print-header">
            <div className="logo-cell">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/logo-full.png" alt="BRT SOP Center" />
            </div>
            <div className="title-cell" style={{ borderBottom: 0 }}>
              <span className="co">BLUE RIBBON TRADING · STANDARD OPERATING PROCEDURE</span>
              <h1>{doc.title}</h1>
            </div>
            <div className="meta" style={{ borderTop: '1.5px solid #1b2a4a' }}>
              <div>
                รหัสเอกสาร
                <b>{doc.code}</b>
              </div>
              <div>
                เวอร์ชัน
                <b>{doc.versionLabel ?? `ร่าง r${doc.revisionNo}`}</b>
              </div>
              <div>
                วันที่มีผล
                <b>{isControlled || doc.state === 'SUPERSEDED' ? fmtDate(doc.effectiveDate) : '—'}</b>
              </div>
              <div>
                สถานะ
                <b>{STATE_LABEL[doc.state]}</b>
              </div>
            </div>
          </div>

          {!isControlled && (
            <p className="alert alert-warn" style={{ marginBottom: 20 }}>
              {doc.state === 'SUPERSEDED'
                ? 'เอกสารฉบับนี้ถูกแทนที่แล้ว ใช้เพื่อการอ้างอิงย้อนหลังเท่านั้น'
                : 'เอกสารฉบับร่าง — ยังไม่ได้รับอนุมัติ ห้ามนำไปใช้ปฏิบัติงาน'}
            </p>
          )}

          <SopEditor content={doc.content} editable={false} diagrams={doc.diagrams} />

          <div className="print-signoff">
            <div>
              <span className="muted">จัดทำโดย</span>
              <b>{doc.preparedBy}</b>
            </div>
            <div>
              <span className="muted">ตรวจทานโดย</span>
              <b>{doc.reviewed?.name ?? '—'}</b>
              {doc.reviewed && <span>{fmtDate(doc.reviewed.at)}</span>}
            </div>
            <div>
              <span className="muted">อนุมัติโดย</span>
              <b>{doc.approved?.name ?? '—'}</b>
              {doc.approved && <span>{fmtDate(doc.approved.at)}</span>}
            </div>
          </div>
          {footer}
        </div>
      </>
    );
  },
);

/** Wait for web fonts and every image inside `root` (diagram previews, thumbnails) to finish loading. */
export async function waitForAssets(root: HTMLElement | null): Promise<void> {
  await document.fonts?.ready;
  const imgs = Array.from(root?.querySelectorAll('img') ?? []);
  await Promise.all(imgs.map((img) => (img.complete ? null : new Promise((r) => ((img.onload = r), (img.onerror = r))))));
}
