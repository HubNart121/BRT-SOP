'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useDialog } from '../Dialogs';
import { IconX } from '../icons';

const DRAWIO_ORIGIN = 'https://embed.diagrams.net';
const DRAWIO_URL = `${DRAWIO_ORIGIN}/?embed=1&proto=json&spin=1&lang=th&libraries=1&saveAndExit=1&noExitBtn=0`;
const LOAD_TIMEOUT_MS = 25_000;
const MAX_PNG_CHARS = 4_500_000;
const EXPORT = { action: 'export', format: 'png', spinKey: 'saving', border: 12, background: '#ffffff' };

interface Props {
  title: string;
  xml: string | null;
  onSave: (xml: string, png: string | null) => Promise<void>;
  onClose: () => void;
}

interface DrawioMessage {
  event?: string;
  xml?: string;
  exit?: boolean;
  data?: string;
  modified?: boolean;
}

/**
 * draw.io embed mode (https://www.drawio.com/doc/faq/embed-mode) in an iframe.
 * Messages are accepted only from the draw.io origin AND from this iframe's own window.
 */
export function DrawioModal({ title, xml, onSave, onClose }: Props) {
  const dialog = useDialog();
  const frame = useRef<HTMLIFrameElement>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'saving' | 'failed'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const pending = useRef<{ xml: string; exit: boolean; scale: number } | null>(null);
  const modified = useRef(false);
  // Latest props, read from the message handler without re-subscribing.
  const props = useRef({ title, xml, onSave, onClose });
  props.current = { title, xml, onSave, onClose };

  const post = useCallback((msg: Record<string, unknown>) => {
    frame.current?.contentWindow?.postMessage(JSON.stringify(msg), DRAWIO_ORIGIN);
  }, []);

  const askDiscard = useCallback(
    () =>
      dialog.confirm({
        title: 'ปิดโดยไม่บันทึก?',
        message: 'มีการแก้ไขผังงานที่ยังไม่ได้บันทึก',
        confirmLabel: 'ปิดโดยไม่บันทึก',
        danger: true,
      }),
    [dialog],
  );

  useEffect(() => {
    const timer = setTimeout(() => setPhase((p) => (p === 'loading' ? 'failed' : p)), LOAD_TIMEOUT_MS);

    async function finishSave(png: string | null) {
      const job = pending.current;
      pending.current = null;
      if (!job) return;
      try {
        await props.current.onSave(job.xml, png);
        modified.current = false;
        setError(null);
        post({ action: 'status', message: 'บันทึกแล้ว', modified: false });
        if (job.exit) props.current.onClose();
        else setPhase('ready');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ';
        setError(msg);
        setPhase('ready');
        post({ action: 'status', message: `บันทึกไม่สำเร็จ: ${msg}`, modified: true });
      }
    }

    function onMessage(e: MessageEvent) {
      if (e.origin !== DRAWIO_ORIGIN || e.source !== frame.current?.contentWindow) return;
      if (typeof e.data !== 'string' || e.data.length > 20_000_000) return;
      let msg: DrawioMessage;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      switch (msg.event) {
        case 'init':
          clearTimeout(timer);
          setPhase('ready');
          post({ action: 'load', xml: props.current.xml ?? '', autosave: 1, title: props.current.title });
          break;
        case 'autosave':
          modified.current = true;
          break;
        case 'save':
          if (typeof msg.xml !== 'string' || pending.current) return;
          pending.current = { xml: msg.xml, exit: !!msg.exit, scale: 2 };
          setPhase('saving');
          post({ ...EXPORT, scale: 2 });
          break;
        case 'export': {
          const job = pending.current;
          if (!job) return;
          const data = typeof msg.data === 'string' && msg.data.startsWith('data:image/png;base64,') ? msg.data : '';
          if (data.length > MAX_PNG_CHARS && job.scale > 1) {
            job.scale = 1; // very large diagram → export again at 1×
            post({ ...EXPORT, scale: 1 });
          } else {
            void finishSave(data && data.length <= MAX_PNG_CHARS ? data : null);
          }
          break;
        }
        case 'exit':
          if (msg.modified || modified.current) {
            void askDiscard().then((yes) => yes && props.current.onClose());
          } else {
            props.current.onClose();
          }
          break;
      }
    }

    window.addEventListener('message', onMessage);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
    };
  }, [askDiscard, attempt, post]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  async function requestClose() {
    if (phase === 'saving') return;
    if (modified.current && !(await askDiscard())) return;
    onClose();
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="แก้ไข Flowchart">
      <div className="modal">
        <div className="modal-head">
          <span>Flowchart · draw.io</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {phase === 'saving' && <span className="small muted">กำลังบันทึก…</span>}
            {error && (
              <span className="small" style={{ color: 'var(--danger)' }}>
                {error}
              </span>
            )}
            <span className="small muted hide-mobile">กด “บันทึก & ออก” ใน draw.io เพื่อบันทึกและปิด</span>
            <button type="button" className="icon-btn" aria-label="ปิด" onClick={() => void requestClose()}>
              <IconX size={20} />
            </button>
          </span>
        </div>
        <div className="modal-body">
          <iframe key={attempt} ref={frame} src={DRAWIO_URL} title="draw.io editor" allow="clipboard-read; clipboard-write" />
          {phase === 'loading' && (
            <div className="modal-overlay">
              <span className="spinner" />
              กำลังเปิด draw.io…
            </div>
          )}
          {phase === 'failed' && (
            <div className="modal-overlay">
              <strong style={{ color: 'var(--text)' }}>เปิด draw.io ไม่สำเร็จ</strong>
              <span>ตรวจสอบการเชื่อมต่ออินเทอร์เน็ต หรือเครือข่ายบริษัทอาจบล็อก embed.diagrams.net</span>
              <span style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    setPhase('loading');
                    setAttempt((a) => a + 1);
                  }}
                >
                  ลองใหม่
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
                  ปิด
                </button>
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
