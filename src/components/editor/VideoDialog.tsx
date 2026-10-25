'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  VIDEO_DESC_MAX,
  VIDEO_TITLE_MAX,
  formatStart,
  parseYouTube,
  youTubeWatchUrl,
  type VideoAttrs,
} from '@/lib/shared/content';

interface Props {
  initial?: VideoAttrs | null;
  onSubmit: (attrs: VideoAttrs) => void;
  onCancel: () => void;
}

/** Form for a YouTube clip block: clip URL / หัวข้อ / รายละเอียด. Rendered in a portal outside the editor DOM. */
export function VideoDialog({ initial, onSubmit, onCancel }: Props) {
  const [url, setUrl] = useState(initial ? youTubeWatchUrl(initial) : '');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [touched, setTouched] = useState(false);
  const urlInput = useRef<HTMLInputElement>(null);
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;

  const parsed = url.trim() ? parseYouTube(url) : null;
  const urlError = !url.trim() ? 'กรุณาวางลิงก์คลิป YouTube' : !parsed ? 'ลิงก์นี้ไม่ใช่วิดีโอ YouTube' : null;
  const titleError = !title.trim() ? 'กรุณาระบุหัวข้อ' : null;

  useEffect(() => {
    urlInput.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        cancelRef.current();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  function submit(e: FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    setTouched(true);
    if (urlError || titleError || !parsed) return;
    onSubmit({ videoId: parsed.videoId, start: parsed.start, title: title.trim(), description: description.trim() });
  }

  return createPortal(
    <div className="modal-backdrop" style={{ zIndex: 120 }} onMouseDown={onCancel}>
      <form
        className="dialog"
        style={{ maxWidth: 560 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="video-dlg-title"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={submit}
        noValidate
      >
        <h2 id="video-dlg-title" style={{ fontSize: 18, fontWeight: 700 }}>
          {initial ? 'แก้ไขวิดีโอ' : 'แทรกวิดีโอ YouTube'}
        </h2>

        <label className="field">
          คลิป (ลิงก์ YouTube)
          <input
            ref={urlInput}
            className="input"
            type="url"
            inputMode="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=… หรือ https://youtu.be/…"
            aria-invalid={touched && !!urlError}
          />
          {touched && urlError ? (
            <span className="field-error">{urlError}</span>
          ) : parsed?.start ? (
            <span className="hint">เริ่มเล่นที่ {formatStart(parsed.start)}</span>
          ) : (
            <span className="hint">รองรับลิงก์ watch, youtu.be, shorts และใส่เวลาเริ่ม (t=) ได้</span>
          )}
        </label>

        {parsed && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`https://i.ytimg.com/vi/${parsed.videoId}/mqdefault.jpg`}
            alt="ภาพตัวอย่างวิดีโอ"
            style={{ width: 200, aspectRatio: '16 / 9', objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }}
          />
        )}

        <label className="field">
          หัวข้อ
          <input
            className="input"
            value={title}
            maxLength={VIDEO_TITLE_MAX}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="เช่น วิธีตรวจรับสินค้าและบันทึกเข้าระบบ"
            aria-invalid={touched && !!titleError}
          />
          {touched && titleError && <span className="field-error">{titleError}</span>}
        </label>

        <label className="field">
          รายละเอียด <span className="hint">(ไม่บังคับ)</span>
          <textarea
            className="textarea"
            rows={5}
            value={description}
            maxLength={VIDEO_DESC_MAX}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="อธิบายสิ่งที่ควรสังเกตในคลิป ขั้นตอนที่เกี่ยวข้อง หรือช่วงเวลาสำคัญ"
          />
          <span className="hint" style={{ alignSelf: 'flex-end' }}>
            {description.length.toLocaleString()} / {VIDEO_DESC_MAX.toLocaleString()}
          </span>
        </label>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            ยกเลิก
          </button>
          <button type="submit" className="btn btn-primary">
            {initial ? 'บันทึกการแก้ไข' : 'แทรกวิดีโอ'}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
