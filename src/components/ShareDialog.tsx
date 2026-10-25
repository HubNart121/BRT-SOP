'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { fmtDateTime } from '@/lib/shared/labels';
import type { ShareLink } from '@/lib/shared/types';
import { useAuth } from './AuthProvider';
import { useDialog } from './Dialogs';
import { IconCopy, IconLink, IconX } from './icons';

const PRESETS = [
  { key: '1h', label: '1 ชั่วโมง', ms: 3600_000 },
  { key: '24h', label: '24 ชั่วโมง', ms: 24 * 3600_000 },
  { key: '7d', label: '7 วัน', ms: 7 * 24 * 3600_000 },
  { key: '30d', label: '30 วัน', ms: 30 * 24 * 3600_000 },
  { key: 'custom', label: 'กำหนดเอง', ms: 0 },
] as const;
type PresetKey = (typeof PRESETS)[number]['key'];
const MAX_DAYS = 90;

/** `datetime-local` value (local time) for a Date. */
function toLocalInput(d: Date): string {
  const off = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

interface Props {
  sopId: string;
  code: string;
  publishedLabel: string | null;
  onClose: () => void;
}

export function ShareDialog({ sopId, code, publishedLabel, onClose }: Props) {
  const { api } = useAuth();
  const dialog = useDialog();
  const [links, setLinks] = useState<ShareLink[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [preset, setPreset] = useState<PresetKey>('24h');
  const [custom, setCustom] = useState(() => toLocalInput(new Date(Date.now() + 3 * 24 * 3600_000)));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ url: string; expires_at: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const resultInput = useRef<HTMLInputElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const load = useCallback(async () => {
    try {
      const r = await api<{ links: ShareLink[] }>(`/api/sops/${sopId}/shares`);
      setLinks(r.links);
      setListError(null);
    } catch (e) {
      setListError((e as Error).message);
    }
  }, [api, sopId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('[role="alertdialog"]')) closeRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function expiry(): Date | null {
    if (preset !== 'custom') return new Date(Date.now() + PRESETS.find((p) => p.key === preset)!.ms);
    const d = new Date(custom);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const exp = expiry();
    if (!exp || exp.getTime() <= Date.now() + 60_000) {
      setError('วันหมดอายุต้องอยู่ในอนาคต');
      return;
    }
    if (exp.getTime() > Date.now() + MAX_DAYS * 24 * 3600_000) {
      setError(`ลิงก์มีอายุได้ไม่เกิน ${MAX_DAYS} วัน`);
      return;
    }
    setBusy(true);
    try {
      const r = await api<{ token: string; link: ShareLink }>(`/api/sops/${sopId}/shares`, {
        method: 'POST',
        json: { expiresAt: exp.toISOString(), note: note.trim() },
      });
      setCreated({ url: `${window.location.origin}/share/${r.token}`, expires_at: r.link.expires_at });
      setCopied(false);
      setNote('');
      void load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.url);
      setCopied(true);
    } catch {
      resultInput.current?.select();
      setCopied(false);
    }
  }

  async function revoke(link: ShareLink) {
    const yes = await dialog.confirm({
      title: 'ยกเลิกลิงก์นี้?',
      message: 'ผู้ที่ได้รับลิงก์จะเปิดเอกสารไม่ได้ทันที และนำกลับมาใช้อีกไม่ได้',
      confirmLabel: 'ยกเลิกลิงก์',
      danger: true,
    });
    if (!yes) return;
    try {
      await api(`/api/sops/${sopId}/shares/${link.id}`, { method: 'DELETE' });
      void load();
    } catch (err) {
      setListError((err as Error).message);
    }
  }

  const now = new Date();
  return createPortal(
    <div className="modal-backdrop" style={{ zIndex: 120 }} onMouseDown={onClose}>
      <div
        className="dialog"
        style={{ maxWidth: 620 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2 id="share-title" style={{ fontSize: 18, fontWeight: 700, flex: 1 }}>
            แชร์ลิงก์ {code}
          </h2>
          <button type="button" className="icon-btn" aria-label="ปิด" onClick={onClose}>
            <IconX size={20} />
          </button>
        </div>
        <p className="small muted" style={{ marginTop: -8 }}>
          ผู้ที่มีลิงก์ดู <b>ฉบับเผยแพร่ล่าสุด</b>
          {publishedLabel ? ` (ตอนนี้คือเวอร์ชัน ${publishedLabel})` : ''} ได้โดยไม่ต้องเข้าสู่ระบบ แบบอ่านอย่างเดียว —
          ไม่เห็นฉบับร่าง ประวัติการพิจารณา หรืออีเมลของพนักงาน
        </p>

        {created ? (
          <div className="alert alert-success" style={{ display: 'flex', flexDirection: 'column', gap: 10, fontWeight: 400 }}>
            <strong>สร้างลิงก์แล้ว — ใช้ได้ถึง {fmtDateTime(created.expires_at)}</strong>
            <div className="share-result">
              <input ref={resultInput} className="input" readOnly value={created.url} onFocus={(e) => e.target.select()} aria-label="ลิงก์แชร์" />
              <button type="button" className="btn btn-primary" onClick={() => void copy()}>
                <IconCopy size={16} />
                {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
              </button>
            </div>
            <span className="small">
              คัดลอกเก็บไว้ตอนนี้ — ระบบเก็บเฉพาะรหัสที่เข้ารหัสแล้ว จึงแสดงลิงก์นี้ได้ครั้งเดียว
            </span>
            <button type="button" className="btn-link" style={{ alignSelf: 'flex-start' }} onClick={() => setCreated(null)}>
              สร้างลิงก์อื่น
            </button>
          </div>
        ) : (
          <form onSubmit={create} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="field">
              ระยะเวลาที่ลิงก์ใช้ได้
              <div className="chips-row" role="radiogroup" aria-label="ระยะเวลา">
                {PRESETS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    role="radio"
                    aria-checked={preset === p.key}
                    aria-pressed={preset === p.key}
                    className="filter-chip"
                    onClick={() => setPreset(p.key)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            {preset === 'custom' && (
              <label className="field">
                หมดอายุเมื่อ
                <input
                  className="input"
                  type="datetime-local"
                  value={custom}
                  min={toLocalInput(new Date(Date.now() + 5 * 60_000))}
                  max={toLocalInput(new Date(Date.now() + MAX_DAYS * 24 * 3600_000))}
                  onChange={(e) => setCustom(e.target.value)}
                />
                <span className="hint">สูงสุด {MAX_DAYS} วัน</span>
              </label>
            )}
            <label className="field">
              หมายเหตุ <span className="hint">(ไม่บังคับ — เช่น แชร์ให้ใคร เพื่ออะไร)</span>
              <input className="input" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="เช่น ส่งให้ผู้ตรวจสอบภายนอก" />
            </label>
            {error && <div className="alert alert-error">{error}</div>}
            <button type="submit" className="btn btn-primary" disabled={busy} style={{ alignSelf: 'flex-start' }}>
              <IconLink size={17} />
              {busy ? 'กำลังสร้าง…' : 'สร้างลิงก์'}
            </button>
          </form>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <strong style={{ fontSize: 14 }}>ลิงก์ที่สร้างไว้</strong>
          {listError && <div className="alert alert-error small">{listError}</div>}
          {!links && !listError && <span className="small muted">กำลังโหลด…</span>}
          {links?.length === 0 && <span className="small muted">ยังไม่มีลิงก์แชร์</span>}
          <ul className="share-list">
            {links?.map((l) => (
              <li key={l.id} className={`share-item${l.status === 'active' ? '' : ' inactive'}`}>
                <span className="grow">
                  <span style={{ fontWeight: 600 }}>
                    {l.note || 'ไม่มีหมายเหตุ'} <span className="muted">· …/share/{l.token_hint}…</span>
                  </span>
                  <span className="muted">
                    {l.status === 'active' && `ใช้ได้ถึง ${fmtDateTime(l.expires_at)}`}
                    {l.status === 'expired' && `หมดอายุ ${fmtDateTime(l.expires_at)}`}
                    {l.status === 'revoked' && `ยกเลิกเมื่อ ${fmtDateTime(l.revoked_at)}`}
                    {' · '}สร้างโดย {l.created_by_name} · เปิดดู {l.view_count} ครั้ง
                    {l.last_viewed_at ? ` (ล่าสุด ${fmtDateTime(l.last_viewed_at)})` : ''}
                  </span>
                </span>
                {l.status === 'active' && new Date(l.expires_at) > now ? (
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => void revoke(l)}>
                    ยกเลิก
                  </button>
                ) : (
                  <span className={`chip ${l.status === 'revoked' ? 'chip-danger' : 'chip-superseded'}`}>
                    {l.status === 'revoked' ? 'ยกเลิกแล้ว' : 'หมดอายุ'}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>,
    document.body,
  );
}
