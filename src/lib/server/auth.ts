import 'server-only';
import type { DecodedIdToken } from 'firebase-admin/auth';
import type { Role } from '@/lib/shared/types';
import { getDb, type Queryable } from './db';
import { adminAuth } from './firebase-admin';
import { HttpError, forbidden } from './http';

export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  firebase_uid: string | null;
}

const USER_COLS = 'id, email, full_name, role, is_active, firebase_uid';

/** Demo login without Firebase. Only possible in `next dev` with NEXT_PUBLIC_AUTH_MODE=dev. */
export function devAuthEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_AUTH_MODE === 'dev';
}

const unauthenticated = (msg = 'กรุณาเข้าสู่ระบบ') => new HttpError(401, msg, 'UNAUTHENTICATED');

/** Authenticate the request (Firebase ID token) and load the matching active app user. */
export async function requireUser(req: Request): Promise<AuthUser> {
  const header = req.headers.get('authorization') ?? '';

  if (header.startsWith('Dev ')) {
    if (!devAuthEnabled()) throw unauthenticated();
    const db = await getDb();
    const email = header.slice(4).trim().toLowerCase();
    const { rows } = await db.query<AuthUser>(`select ${USER_COLS} from app_users where email = $1`, [email]);
    const user = rows[0];
    if (!user) throw unauthenticated('ไม่พบผู้ใช้ตัวอย่างนี้');
    return ensureActive(user);
  }

  if (!header.startsWith('Bearer ')) throw unauthenticated();
  let decoded: DecodedIdToken;
  try {
    decoded = await adminAuth().verifyIdToken(header.slice(7).trim());
  } catch {
    throw new HttpError(401, 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่', 'INVALID_TOKEN');
  }
  return resolveFirebaseUser(await getDb(), decoded);
}

function ensureActive(user: AuthUser): AuthUser {
  if (!user.is_active) throw new HttpError(403, 'บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ', 'INACTIVE');
  return user;
}

async function resolveFirebaseUser(db: Queryable, token: DecodedIdToken): Promise<AuthUser> {
  const byUid = await db.query<AuthUser>(`select ${USER_COLS} from app_users where firebase_uid = $1`, [token.uid]);
  if (byUid.rows[0]) return ensureActive(byUid.rows[0]);

  const email = (token.email ?? '').toLowerCase();
  if (!email) throw new HttpError(403, 'บัญชีนี้ไม่มีอีเมล', 'NO_EMAIL');

  const byEmail = await db.query<AuthUser>(`select ${USER_COLS} from app_users where email = $1`, [email]);
  const existing = byEmail.rows[0];
  if (existing) {
    if (existing.firebase_uid && existing.firebase_uid !== token.uid) {
      throw new HttpError(403, 'บัญชีนี้ไม่ตรงกับที่ลงทะเบียนไว้ กรุณาติดต่อผู้ดูแลระบบ', 'UID_MISMATCH');
    }
    // Linking by e-mail requires proof that the person owns the address.
    if (!token.email_verified) {
      throw new HttpError(403, 'กรุณายืนยันอีเมลก่อนเข้าใช้งาน', 'EMAIL_NOT_VERIFIED');
    }
    const { rows } = await db.query<AuthUser>(
      `update app_users set firebase_uid = $1, updated_at = now() where id = $2 and firebase_uid is null
       returning ${USER_COLS}`,
      [token.uid, existing.id],
    );
    if (!rows[0]) throw new HttpError(409, 'กรุณาลองเข้าสู่ระบบอีกครั้ง', 'RETRY');
    return ensureActive(rows[0]);
  }

  const bootstrap = (process.env.BOOTSTRAP_ADMIN_EMAIL ?? '').trim().toLowerCase();
  if (bootstrap && email === bootstrap) {
    if (!token.email_verified) {
      throw new HttpError(403, 'กรุณายืนยันอีเมลของผู้ดูแลระบบก่อนเข้าใช้งาน', 'EMAIL_NOT_VERIFIED');
    }
    const { rows } = await db.query<AuthUser>(
      `insert into app_users (email, firebase_uid, full_name, role)
       values ($1, $2, $3, 'ADMIN')
       on conflict (email) do nothing
       returning ${USER_COLS}`,
      [email, token.uid, token.name ?? ''],
    );
    if (rows[0]) {
      await db.query(
        `insert into audit_events (actor_id, event_type, metadata) values ($1, 'ADMIN_BOOTSTRAPPED', $2)`,
        [rows[0].id, JSON.stringify({ email })],
      );
      return rows[0];
    }
    throw new HttpError(409, 'กรุณาลองเข้าสู่ระบบอีกครั้ง', 'RETRY');
  }

  throw new HttpError(403, 'บัญชีนี้ยังไม่ได้รับเชิญเข้าระบบ กรุณาติดต่อผู้ดูแลระบบ', 'NOT_INVITED');
}

export function requireRole(user: AuthUser, ...roles: Role[]): void {
  if (!roles.includes(user.role)) throw forbidden();
}
