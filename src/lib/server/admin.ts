import 'server-only';
import { ROLES, type AppUserRow, type Category, type Role } from '@/lib/shared/types';
import { audit } from './access';
import { devAuthEnabled, requireRole, type AuthUser } from './auth';
import { C, data, emailKey, getDb, iso, newId, now, type CategoryDoc, type SopDoc, type UserDoc } from './db';
import { adminAuth } from './firebase-admin';
import { badRequest, conflict, notFound, str, uuid } from './http';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLE_ORDER: Record<Role, number> = { ADMIN: 0, APPROVER: 1, REVIEWER: 2, AUTHOR: 3, VIEWER: 4 };

function role(value: unknown): Role {
  if (typeof value !== 'string' || !ROLES.includes(value as Role)) throw badRequest('บทบาทไม่ถูกต้อง');
  return value as Role;
}

const userRow = (id: string, u: UserDoc): AppUserRow => ({
  id,
  email: u.email,
  full_name: u.full_name,
  role: u.role,
  is_active: u.is_active,
  firebase_linked: !!u.firebase_uid,
  last_login_at: iso(u.last_login_at),
  created_at: iso(u.created_at)!,
});

// ═══ Users ═════════════════════════════════════════════════════════════

export async function listUsers(user: AuthUser): Promise<AppUserRow[]> {
  requireRole(user, 'ADMIN');
  const db = await getDb();
  const snap = await db.collection(C.users).get();
  return snap.docs
    .map((d) => userRow(d.id, d.data() as UserDoc))
    .sort(
      (a, b) =>
        Number(b.is_active) - Number(a.is_active) ||
        ROLE_ORDER[a.role] - ROLE_ORDER[b.role] ||
        (a.full_name || a.email).localeCompare(b.full_name || b.email, 'th'),
    );
}

/**
 * Invite a user. With Firebase Auth the account is created (or linked if it already exists)
 * so the person can set a password through the "reset password" e-mail.
 */
export async function inviteUser(user: AuthUser, body: Record<string, unknown>) {
  requireRole(user, 'ADMIN');
  const email = str(body.email, 'อีเมล', { max: 254 }).toLowerCase();
  if (!EMAIL_RE.test(email)) throw badRequest('รูปแบบอีเมลไม่ถูกต้อง');
  const fullName = str(body.full_name, 'ชื่อ-นามสกุล', { max: 120 });
  const r = role(body.role);

  const db = await getDb();
  if ((await db.collection(C.userEmails).doc(emailKey(email)).get()).exists) {
    throw conflict('อีเมลนี้มีอยู่ในระบบแล้ว', 'DUPLICATE_EMAIL');
  }

  let firebaseUid: string | null = null;
  let warning: string | null = null;
  /** created: new account (password set via reset e-mail) · linked: existing verified account · unverified / failed: must verify e-mail at first login */
  let firebaseAccount: 'created' | 'linked' | 'unverified' | 'failed' | 'none' = 'none';
  if (!devAuthEnabled()) {
    try {
      const auth = adminAuth();
      const existing = await auth.getUserByEmail(email).catch((e: { code?: string }) => {
        if (e.code === 'auth/user-not-found') return null;
        throw e;
      });
      if (!existing) {
        firebaseUid = (await auth.createUser({ email, displayName: fullName, emailVerified: false })).uid;
        firebaseAccount = 'created';
      } else if (existing.emailVerified) {
        firebaseUid = existing.uid;
        firebaseAccount = 'linked';
      } else {
        // Someone registered this address without proving they own it: do NOT link that account.
        // The real owner signs in after verifying the e-mail (see resolveFirebaseUser).
        firebaseAccount = 'unverified';
        warning = 'อีเมลนี้มีบัญชี Firebase ที่ยังไม่ยืนยันอีเมลอยู่แล้ว — ผู้ใช้ต้องยืนยันอีเมลก่อนเข้าใช้งานครั้งแรก';
      }
    } catch (e) {
      console.error('[users] Firebase account creation failed', e);
      firebaseAccount = 'failed';
      warning =
        'สร้างบัญชีใน Firebase Authentication ไม่สำเร็จ — ผู้ใช้จะต้องสมัครด้วยอีเมลนี้และยืนยันอีเมลก่อนเข้าใช้งาน ' +
        '(ตรวจสอบสิทธิ์ Firebase Authentication Admin ของ service account)';
    }
  }

  const id = newId();
  const created = await db.runTransaction(async (t) => {
    const indexRef = db.collection(C.userEmails).doc(emailKey(email));
    if ((await t.get(indexRef)).exists) throw conflict('อีเมลนี้มีอยู่ในระบบแล้ว', 'DUPLICATE_EMAIL');
    const ts = now();
    const doc: UserDoc = {
      email,
      firebase_uid: firebaseUid,
      full_name: fullName,
      role: r,
      is_active: true,
      created_at: ts,
      updated_at: ts,
      last_login_at: null,
    };
    t.create(indexRef, { user_id: id });
    t.create(db.collection(C.users).doc(id), doc);
    audit(db, t, { actor: user.id, type: 'USER_INVITED', meta: { user_id: id, email, role: r } });
    return userRow(id, doc);
  });
  return { user: created, warning, firebaseAccount };
}

export async function updateUser(user: AuthUser, id: string, body: Record<string, unknown>) {
  requireRole(user, 'ADMIN');
  const next = {
    full_name: body.full_name !== undefined ? str(body.full_name, 'ชื่อ-นามสกุล', { max: 120 }) : undefined,
    role: body.role !== undefined ? role(body.role) : undefined,
    is_active: body.is_active !== undefined ? body.is_active === true : undefined,
  };
  const db = await getDb();
  return db.runTransaction(async (t) => {
    const ref = db.collection(C.users).doc(id);
    const target = data<UserDoc>(await t.get(ref));
    if (!target) throw notFound('ไม่พบผู้ใช้');
    const losesAdmin =
      target.role === 'ADMIN' && target.is_active && ((next.role && next.role !== 'ADMIN') || next.is_active === false);
    if (losesAdmin) {
      if (id === user.id) throw badRequest('ไม่สามารถลดสิทธิ์หรือระงับบัญชีผู้ดูแลระบบของตนเองได้');
      // Read the admins inside the transaction so concurrent changes cannot remove the last one.
      const admins = await t.get(
        db.collection(C.users).where('role', '==', 'ADMIN').where('is_active', '==', true),
      );
      if (admins.size <= 1) throw badRequest('ต้องมีผู้ดูแลระบบที่ใช้งานอยู่อย่างน้อย 1 คน');
    }
    const ts = now();
    const patch: Partial<UserDoc> = { updated_at: ts };
    if (next.full_name !== undefined) patch.full_name = next.full_name;
    if (next.role !== undefined) patch.role = next.role;
    if (next.is_active !== undefined) patch.is_active = next.is_active;
    t.update(ref, patch);
    audit(db, t, { actor: user.id, type: 'USER_UPDATED', meta: { user_id: id, ...next } });
    return { user: userRow(id, { ...target, ...patch }) };
  });
}

// ═══ Categories ════════════════════════════════════════════════════════

export async function listCategories(): Promise<Category[]> {
  const db = await getDb();
  const [cats, sops] = await Promise.all([
    db.collection(C.categories).get(),
    db.collection(C.sops).select('category_id').get(),
  ]);
  const counts = new Map<string, number>();
  for (const s of sops.docs) {
    const c = (s.data() as Pick<SopDoc, 'category_id'>).category_id;
    if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return cats.docs
    .map((d) => {
      const c = d.data() as CategoryDoc;
      return {
        id: d.id,
        name: c.name,
        slug: c.slug,
        parent_id: c.parent_id,
        sort_order: c.sort_order,
        sop_count: counts.get(d.id) ?? 0,
      };
    })
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'th'));
}

export async function createCategory(user: AuthUser, body: Record<string, unknown>) {
  requireRole(user, 'ADMIN');
  const name = str(body.name, 'ชื่อหมวดหมู่', { max: 80 });
  const slug = str(body.slug, 'รหัสหมวด', { max: 40 }).toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(slug)) throw badRequest('รหัสหมวดใช้ได้เฉพาะ a-z, 0-9 และ - เช่น qc หรือ after-sales');
  const parentId = body.parent_id ? uuid(body.parent_id, 'หมวดหลัก') : null;

  const db = await getDb();
  const id = newId();
  return db.runTransaction(async (t) => {
    const slugRef = db.collection(C.categorySlugs).doc(slug);
    const [slugSnap, parentSnap, all] = await Promise.all([
      t.get(slugRef),
      parentId ? t.get(db.collection(C.categories).doc(parentId)) : null,
      t.get(db.collection(C.categories).select('sort_order')),
    ]);
    if (slugSnap.exists) throw conflict('รหัสหมวดนี้มีอยู่แล้ว', 'DUPLICATE_SLUG');
    if (parentSnap && !parentSnap.exists) throw badRequest('ไม่พบหมวดหลักที่เลือก');
    const sortOrder = Math.max(0, ...all.docs.map((d) => Number(d.get('sort_order')) || 0)) + 10;
    const doc: CategoryDoc = { name, slug, parent_id: parentId, sort_order: sortOrder, created_at: now() };
    t.create(slugRef, { category_id: id });
    t.create(db.collection(C.categories).doc(id), doc);
    audit(db, t, { actor: user.id, type: 'CATEGORY_CREATED', meta: { category_id: id, name, slug } });
    const category: Category = { id, name, slug, parent_id: parentId, sort_order: sortOrder, sop_count: 0 };
    return { category };
  });
}
