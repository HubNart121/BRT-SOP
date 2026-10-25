import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { ContentError } from '@/lib/shared/content';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, code?: string) => new HttpError(400, msg, code);
export const forbidden = (msg = 'คุณไม่มีสิทธิ์ทำรายการนี้') => new HttpError(403, msg, 'FORBIDDEN');
export const notFound = (msg = 'ไม่พบข้อมูล') => new HttpError(404, msg, 'NOT_FOUND');
export const conflict = (msg: string, code = 'CONFLICT') => new HttpError(409, msg, code);

type Handler<C> = (req: NextRequest, ctx: C) => Promise<unknown>;

/** Wrap a route handler: JSON responses + consistent error mapping. */
export function route<C>(fn: Handler<C>) {
  return async (req: NextRequest, ctx: C): Promise<Response> => {
    try {
      const result = await fn(req, ctx);
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
  }
  if (err instanceof ContentError) {
    return NextResponse.json({ error: err.message, code: 'INVALID_CONTENT' }, { status: 400 });
  }
  const pgCode = (err as { code?: string } | null)?.code;
  if (pgCode === '23505') {
    return NextResponse.json({ error: 'ข้อมูลซ้ำกับที่มีอยู่แล้วในระบบ', code: 'DUPLICATE' }, { status: 409 });
  }
  if (pgCode === '23514' || pgCode === '22P02') {
    return NextResponse.json({ error: 'ข้อมูลไม่ถูกต้องตามรูปแบบที่กำหนด', code: 'INVALID' }, { status: 400 });
  }
  console.error('[api] unexpected error', err);
  return NextResponse.json({ error: 'เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง', code: 'INTERNAL' }, { status: 500 });
}

/** Read a JSON body with a size limit. */
export async function readJson<T = Record<string, unknown>>(req: Request, maxBytes = 2_000_000): Promise<T> {
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, 'ข้อมูลมีขนาดใหญ่เกินกำหนด', 'TOO_LARGE');
  try {
    const data = JSON.parse(text || '{}');
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('not an object');
    return data as T;
  } catch {
    throw badRequest('รูปแบบข้อมูลไม่ถูกต้อง');
  }
}

export function str(
  value: unknown,
  label: string,
  opts: { min?: number; max?: number; optional?: boolean } = {},
): string {
  const { min = 1, max = 500, optional = false } = opts;
  if (value === undefined || value === null || value === '') {
    if (optional) return '';
    throw badRequest(`กรุณาระบุ${label}`);
  }
  if (typeof value !== 'string') throw badRequest(`${label}ไม่ถูกต้อง`);
  const v = value.trim();
  if (v.length < min) throw badRequest(optional ? `${label}สั้นเกินไป` : `กรุณาระบุ${label}`);
  if (v.length > max) throw badRequest(`${label}ยาวเกิน ${max} ตัวอักษร`);
  return v;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function uuid(value: unknown, label = 'รหัสอ้างอิง'): string {
  if (typeof value !== 'string' || !UUID_RE.test(value)) throw badRequest(`${label}ไม่ถูกต้อง`);
  return value.toLowerCase();
}

/** Route params that should be UUIDs: a malformed id is simply "not found". */
export function idParam(value: string): string {
  if (!UUID_RE.test(value)) throw notFound();
  return value.toLowerCase();
}
