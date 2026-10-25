import type { TiptapDoc, TiptapMark, TiptapNode } from './types';

/** Node types the editor produces. Anything else is rejected by the API. */
const NODE_TYPES = new Set([
  'doc',
  'paragraph',
  'text',
  'heading',
  'bulletList',
  'orderedList',
  'listItem',
  'blockquote',
  'codeBlock',
  'hardBreak',
  'horizontalRule',
  'table',
  'tableRow',
  'tableCell',
  'tableHeader',
  'drawio',
  'youtube',
]);
const MARK_TYPES = new Set(['bold', 'italic', 'underline', 'strike', 'code', 'link']);
const BLOCK_TYPES = new Set([
  'paragraph',
  'heading',
  'listItem',
  'blockquote',
  'codeBlock',
  'tableRow',
  'tableCell',
  'tableHeader',
  'drawio',
  'youtube',
]);

/** UTF-8 bytes of the content JSON (Firestore documents are limited to 1 MiB in total). */
export const MAX_DOC_BYTES = 600_000;
const MAX_NODES = 20_000;
const MAX_DEPTH = 40;
export const BLOCK_ID_RE = /^[A-Za-z0-9_-]{6,64}$/;
const SAFE_HREF_RE = /^(https?:\/\/|mailto:)/i;
export const YT_ID_RE = /^[A-Za-z0-9_-]{11}$/;
export const VIDEO_TITLE_MAX = 200;
export const VIDEO_DESC_MAX = 5000;

export class ContentError extends Error {}

export interface VideoAttrs {
  videoId: string;
  start: number | null;
  title: string;
  description: string;
}

/**
 * Parse a YouTube link: youtube.com/watch?v=, youtu.be/, /shorts/, /embed/, /live/
 * (with optional t= / start= such as 90, 1m30s). Returns null if it is not a YouTube video link.
 */
export function parseYouTube(input: string): { videoId: string; start: number | null } | null {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase().replace(/^(www\.|m\.|music\.)/, '');
  let id: string | null = null;
  if (host === 'youtu.be') {
    id = u.pathname.slice(1).split('/')[0];
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else id = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/]+)/)?.[1] ?? null;
  }
  if (!id || !YT_ID_RE.test(id)) return null;
  return { videoId: id, start: parseStart(u.searchParams.get('t') ?? u.searchParams.get('start')) };
}

function parseStart(t: string | null): number | null {
  if (!t) return null;
  if (/^\d+s?$/.test(t)) return Number.parseInt(t, 10);
  const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!m || !(m[1] || m[2] || m[3])) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

export function youTubeWatchUrl(a: { videoId: string; start?: number | null }): string {
  return `https://www.youtube.com/watch?v=${a.videoId}${a.start ? `&t=${a.start}s` : ''}`;
}

export function formatStart(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = String(sec % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

function sanitizeVideoAttrs(a: Record<string, unknown>): Record<string, unknown> {
  const videoId = a.videoId;
  if (typeof videoId !== 'string' || !YT_ID_RE.test(videoId)) throw new ContentError('ลิงก์วิดีโอ YouTube ไม่ถูกต้อง');
  const title = typeof a.title === 'string' ? a.title.trim() : '';
  if (!title) throw new ContentError('กรุณาระบุหัวข้อของวิดีโอ');
  if (title.length > VIDEO_TITLE_MAX) throw new ContentError(`หัวข้อวิดีโอยาวเกิน ${VIDEO_TITLE_MAX} ตัวอักษร`);
  const description = typeof a.description === 'string' ? a.description.trim() : '';
  if (description.length > VIDEO_DESC_MAX) throw new ContentError(`รายละเอียดวิดีโอยาวเกิน ${VIDEO_DESC_MAX} ตัวอักษร`);
  const start =
    typeof a.start === 'number' && Number.isInteger(a.start) && a.start > 0 && a.start <= 86_400 ? a.start : null;
  return { videoId, start, title, description };
}

/** Validate untrusted Tiptap JSON and return a clean copy (unknown attributes are kept only for known nodes). */
export function sanitizeDoc(input: unknown): TiptapDoc {
  let count = 0;
  const visit = (raw: unknown, depth: number): TiptapNode => {
    if (++count > MAX_NODES) throw new ContentError('เอกสารมีขนาดใหญ่เกินไป');
    if (depth > MAX_DEPTH) throw new ContentError('โครงสร้างเอกสารซ้อนลึกเกินไป');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ContentError('รูปแบบเนื้อหาไม่ถูกต้อง');
    const n = raw as Record<string, unknown>;
    const type = n.type;
    if (typeof type !== 'string' || !NODE_TYPES.has(type)) {
      throw new ContentError(`ไม่รองรับองค์ประกอบ "${String(type)}" ในเนื้อหา`);
    }
    const out: TiptapNode = { type };
    if (type === 'text') {
      if (typeof n.text !== 'string') throw new ContentError('ข้อความไม่ถูกต้อง');
      out.text = n.text;
    }
    if (n.attrs !== undefined) {
      if (!n.attrs || typeof n.attrs !== 'object' || Array.isArray(n.attrs)) {
        throw new ContentError('คุณสมบัติขององค์ประกอบไม่ถูกต้อง');
      }
      const attrs: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(n.attrs as Record<string, unknown>)) {
        if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) attrs[k] = v;
        else if (Array.isArray(v) && v.every((x) => typeof x === 'number')) attrs[k] = v; // colwidth
      }
      out.attrs = attrs;
    }
    if (type === 'drawio') {
      const blockId = out.attrs?.blockId;
      if (typeof blockId !== 'string' || !BLOCK_ID_RE.test(blockId)) {
        throw new ContentError('รหัส Flowchart ไม่ถูกต้อง');
      }
    }
    if (type === 'youtube') {
      out.attrs = sanitizeVideoAttrs(out.attrs ?? {});
      if (n.content !== undefined) throw new ContentError('วิดีโอต้องไม่มีเนื้อหาย่อย');
    }
    if (n.marks !== undefined) {
      if (!Array.isArray(n.marks)) throw new ContentError('รูปแบบตัวอักษรไม่ถูกต้อง');
      out.marks = n.marks.map((m): TiptapMark => {
        const mark = m as TiptapMark;
        if (!mark || typeof mark.type !== 'string' || !MARK_TYPES.has(mark.type)) {
          throw new ContentError('ไม่รองรับรูปแบบตัวอักษรนี้');
        }
        if (mark.type === 'link') {
          const href = mark.attrs?.href;
          if (typeof href !== 'string' || !SAFE_HREF_RE.test(href)) {
            throw new ContentError('ลิงก์ต้องขึ้นต้นด้วย http://, https:// หรือ mailto:');
          }
          return { type: 'link', attrs: { href } };
        }
        return { type: mark.type };
      });
    }
    if (n.content !== undefined) {
      if (!Array.isArray(n.content)) throw new ContentError('รูปแบบเนื้อหาไม่ถูกต้อง');
      out.content = n.content.map((c) => visit(c, depth + 1));
    }
    return out;
  };
  const doc = visit(input, 0);
  if (doc.type !== 'doc') throw new ContentError('เนื้อหาต้องเป็นเอกสาร');
  return doc as TiptapDoc;
}

/** Plain text used for search (content_text). */
export function docToText(doc: TiptapNode): string {
  const parts: string[] = [];
  const walk = (n: TiptapNode) => {
    if (n.type === 'text') {
      parts.push(n.text ?? '');
      return;
    }
    if (n.type === 'hardBreak') {
      parts.push('\n');
      return;
    }
    if (n.type === 'youtube') {
      parts.push(`${n.attrs?.title ?? ''}\n${n.attrs?.description ?? ''}\n`);
      return;
    }
    n.content?.forEach(walk);
    if (BLOCK_TYPES.has(n.type)) parts.push('\n');
  };
  walk(doc);
  return parts
    .join('')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

export function diagramIds(doc: TiptapNode): string[] {
  const ids: string[] = [];
  const walk = (n: TiptapNode) => {
    if (n.type === 'drawio' && typeof n.attrs?.blockId === 'string') ids.push(n.attrs.blockId);
    n.content?.forEach(walk);
  };
  walk(doc);
  return ids;
}

// ── Helpers to build documents (templates / seed data) ─────────────────
export const t = (text: string): TiptapNode => ({ type: 'text', text });
export const p = (text = ''): TiptapNode => (text ? { type: 'paragraph', content: [t(text)] } : { type: 'paragraph' });
export const h2 = (text: string): TiptapNode => ({ type: 'heading', attrs: { level: 2 }, content: [t(text)] });
export const h3 = (text: string): TiptapNode => ({ type: 'heading', attrs: { level: 3 }, content: [t(text)] });
export const ol = (items: string[]): TiptapNode => ({
  type: 'orderedList',
  attrs: { start: 1 },
  content: items.map((i) => ({ type: 'listItem', content: [p(i)] })),
});
export const ul = (items: string[]): TiptapNode => ({
  type: 'bulletList',
  content: items.map((i) => ({ type: 'listItem', content: [p(i)] })),
});
export const doc = (...content: TiptapNode[]): TiptapDoc => ({ type: 'doc', content });

/** Default skeleton for a new SOP. */
export function sopTemplate(): TiptapDoc {
  return doc(
    h2('1. วัตถุประสงค์'),
    p('[ระบุวัตถุประสงค์ของ SOP นี้]'),
    h2('2. ขอบเขต'),
    p('[ระบุหน่วยงาน กระบวนการ หรือสินค้าที่ SOP นี้ครอบคลุม]'),
    h2('3. ผู้รับผิดชอบ'),
    ul(['[ตำแหน่ง] — [หน้าที่]']),
    h2('4. ขั้นตอนการปฏิบัติงาน'),
    ol(['[ขั้นตอนที่ 1]', '[ขั้นตอนที่ 2]']),
    h2('5. เอกสารที่เกี่ยวข้อง'),
    p('[ระบุแบบฟอร์มหรือเอกสารอ้างอิง]'),
  );
}
