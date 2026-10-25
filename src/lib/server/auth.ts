import 'server-only';
import type { DecodedIdToken } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import type { Role } from '@/lib/shared/types';
import { C, data, emailKey, getDb, newId, now, type CategoryDoc, type UserDoc } from './db';
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

export const DEFAULT_CATEGORIES: [name: string, slug: string][] = [
  ['ฝ่ายขาย', 'sales'],
  ['จัดซื้อ', 'purchasing'],
  ['คลังสินค้า', 'warehouse'],
  ['นำเข้า', 'import'],
];

/** Demo login without Firebase. Only possible in `next dev` with NEXT_PUBLIC_AUTH_MODE=dev. */
export function devAuthEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_AUTH_MODE === 'dev';
}

const unauthenticated = (msg = 'กรุณาเข้าสู่ระบบ') => new HttpError(401, msg, 'UNAUTHENTICATED');

const toAuthUser = (id: string, u: UserDoc): AuthUser => ({
  id,
  email: u.email,
  full_name: u.full_name,
  role: u.role,
  is_active: u.is_active,
  firebase_uid: u.firebase_uid,
});

async function findUser(db: Firestore, field: 'email' | 'firebase_uid', value: string): Promise<AuthUser | null> {
  const snap = await db.collection(C.users).where(field, '==', value).limit(1).get();
  const doc = snap.docs[0];
  return doc ? toAuthUser(doc.id, doc.data() as UserDoc) : null;
}

/** Authenticate the request (Firebase ID token) and load the matching active app user. */
export async function requireUser(req: Request): Promise<AuthUser> {
  const header = req.headers.get('authorization') ?? '';

  if (header.startsWith('Dev ')) {
    if (!devAuthEnabled()) throw unauthenticated();
    const user = await findUser(await getDb(), 'email', header.slice(4).trim().toLowerCase());
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

async function resolveFirebaseUser(db: Firestore, token: DecodedIdToken): Promise<AuthUser> {
  const byUid = await findUser(db, 'firebase_uid', token.uid);
  if (byUid) return ensureActive(byUid);

  const email = (token.email ?? '').toLowerCase();
  if (!email) throw new HttpError(403, 'บัญชีนี้ไม่มีอีเมล', 'NO_EMAIL');

  const existing = await findUser(db, 'email', email);
  if (existing) {
    if (existing.firebase_uid && existing.firebase_uid !== token.uid) {
      throw new HttpError(403, 'บัญชีนี้ไม่ตรงกับที่ลงทะเบียนไว้ กรุณาติดต่อผู้ดูแลระบบ', 'UID_MISMATCH');
    }
    // Linking by e-mail requires proof that the person owns the address.
    if (!token.email_verified) {
      throw new HttpError(403, 'กรุณายืนยันอีเมลก่อนเข้าใช้งาน', 'EMAIL_NOT_VERIFIED');
    }
    const linked = await db.runTransaction(async (t) => {
      const ref = db.collection(C.users).doc(existing.id);
      const cur = data<UserDoc>(await t.get(ref));
      if (!cur || (cur.firebase_uid && cur.firebase_uid !== token.uid)) return null;
      t.update(ref, { firebase_uid: token.uid, updated_at: now() });
      return toAuthUser(existing.id, { ...cur, firebase_uid: token.uid });
    });
    if (!linked) throw new HttpError(409, 'กรุณาลองเข้าสู่ระบบอีกครั้ง', 'RETRY');
    return ensureActive(linked);
  }

  const bootstrap = (process.env.BOOTSTRAP_ADMIN_EMAIL ?? '').trim().toLowerCase();
  if (bootstrap && email === bootstrap) {
    if (!token.email_verified) {
      throw new HttpError(403, 'กรุณายืนยันอีเมลของผู้ดูแลระบบก่อนเข้าใช้งาน', 'EMAIL_NOT_VERIFIED');
    }
    return createBootstrapAdmin(db, email, token);
  }

  throw new HttpError(403, 'บัญชีนี้ยังไม่ได้รับเชิญเข้าระบบ กรุณาติดต่อผู้ดูแลระบบ', 'NOT_INVITED');
}

/** First sign-in of BOOTSTRAP_ADMIN_EMAIL: create the ADMIN and, on an empty system, the default categories. */
async function createBootstrapAdmin(db: Firestore, email: string, token: DecodedIdToken): Promise<AuthUser> {
  const id = newId();
  try {
    return await db.runTransaction(async (t) => {
      const anyCategory = await t.get(db.collection(C.categories).limit(1));
      const ts = now();
      const user: UserDoc = {
        email,
        firebase_uid: token.uid,
        full_name: (token.name as string | undefined) ?? '',
        role: 'ADMIN',
        is_active: true,
        created_at: ts,
        updated_at: ts,
        last_login_at: null,
      };
      t.create(db.collection(C.userEmails).doc(emailKey(email)), { user_id: id });
      t.create(db.collection(C.users).doc(id), user);
      if (anyCategory.empty) {
        DEFAULT_CATEGORIES.forEach(([name, slug], i) => {
          const catId = newId();
          const cat: CategoryDoc = { name, slug, parent_id: null, sort_order: (i + 1) * 10, created_at: ts };
          t.create(db.collection(C.categories).doc(catId), cat);
          t.create(db.collection(C.categorySlugs).doc(slug), { category_id: catId });
        });
      }
      t.create(db.collection(C.auditEvents).doc(), {
        actor_id: id,
        event_type: 'ADMIN_BOOTSTRAPPED',
        metadata: { email },
        created_at: ts,
      });
      return toAuthUser(id, user);
    });
  } catch (err) {
    if ((err as { code?: number }).code === 6) throw new HttpError(409, 'กรุณาลองเข้าสู่ระบบอีกครั้ง', 'RETRY');
    throw err;
  }
}

export function requireRole(user: AuthUser, ...roles: Role[]): void {
  if (!roles.includes(user.role)) throw forbidden();
}
