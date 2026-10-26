import 'server-only';
import { isGmail } from '@/lib/shared/email';
import { ROLES, type AppUserRow, type Category, type Role } from '@/lib/shared/types';
import { audit } from './access';
import { requireRole, type AuthUser } from './auth';
import { C, data, emailKey, getDb, iso, newId, now, type CategoryDoc, type SopDoc, type UserDoc } from './db';
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
  if (!isGmail(email)) throw badRequest('เชิญได้เฉพาะอีเมล Gmail (@gmail.com)');
  const fullName = str(body.full_name, 'ชื่อ-นามสกุล', { max: 120 });
  const r = role(body.role);

  const db = await getDb();
  if ((await db.collection(C.userEmails).doc(emailKey(email)).get()).exists) {
    throw conflict('อีเมลนี้มีอยู่ในระบบแล้ว', 'DUPLICATE_EMAIL');
  }

  const id = newId();
  const created = await db.runTransaction(async (t) => {
    const indexRef = db.collection(C.userEmails).doc(emailKey(email));
    if ((await t.get(indexRef)).exists) throw conflict('อีเมลนี้มีอยู่ในระบบแล้ว', 'DUPLICATE_EMAIL');
    const ts = now();
    const doc: UserDoc = {
      email,
      // No Firebase account is created here: the first Google sign-in with this (verified) Gmail address links it.
      firebase_uid: null,
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
  return { user: created };
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

function categorySlug(value: unknown): string {
  const slug = str(value, 'รหัสหมวด', { max: 40 }).toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(slug)) throw badRequest('รหัสหมวดใช้ได้เฉพาะ a-z, 0-9 และ - เช่น qc หรือ after-sales');
  return slug;
}

export async function createCategory(user: AuthUser, body: Record<string, unknown>) {
  requireRole(user, 'ADMIN');
  const name = str(body.name, 'ชื่อหมวดหมู่', { max: 80 });
  const slug = categorySlug(body.slug);
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

/** Rename, change the code (slug) or move a category under another one. Fields left out stay as they are. */
export async function updateCategory(user: AuthUser, id: string, body: Record<string, unknown>) {
  requireRole(user, 'ADMIN');
  const name = body.name !== undefined ? str(body.name, 'ชื่อหมวดหมู่', { max: 80 }) : undefined;
  const slug = body.slug !== undefined ? categorySlug(body.slug) : undefined;
  const parentProvided = Object.prototype.hasOwnProperty.call(body, 'parent_id');
  const parentId = parentProvided && body.parent_id ? uuid(body.parent_id, 'หมวดหลัก') : null;
  if (parentId === id) throw badRequest('หมวดหลักต้องไม่ใช่หมวดเดียวกัน');

  const db = await getDb();
  const ref = db.collection(C.categories).doc(id);
  const saved = await db.runTransaction(async (t) => {
    const [cur, slugSnap, all] = await Promise.all([
      t.get(ref).then((s) => data<CategoryDoc>(s)),
      slug ? t.get(db.collection(C.categorySlugs).doc(slug)) : null,
      parentId ? t.get(db.collection(C.categories).select('parent_id')) : null,
    ]);
    if (!cur) throw notFound('ไม่พบหมวดหมู่');
    const slugChanged = slug !== undefined && slug !== cur.slug;
    if (slugChanged && slugSnap?.exists) throw conflict('รหัสหมวดนี้มีอยู่แล้ว', 'DUPLICATE_SLUG');
    if (parentId && all) {
      const parents = new Map(all.docs.map((d) => [d.id, (d.get('parent_id') as string | null) ?? null]));
      if (!parents.has(parentId)) throw badRequest('ไม่พบหมวดหลักที่เลือก');
      // Walking up from the new parent must never reach this category (no loops).
      for (let p: string | null = parentId, hops = 0; p && hops <= parents.size; p = parents.get(p) ?? null, hops++) {
        if (p === id) throw badRequest('เลือกหมวดย่อยของหมวดนี้เป็นหมวดหลักไม่ได้');
      }
    }

    const patch: Partial<CategoryDoc> = {};
    if (name !== undefined && name !== cur.name) patch.name = name;
    if (slugChanged) patch.slug = slug;
    if (parentProvided && parentId !== cur.parent_id) patch.parent_id = parentId;
    if (Object.keys(patch).length === 0) return { ...cur, ...patch };
    if (slugChanged) {
      t.delete(db.collection(C.categorySlugs).doc(cur.slug));
      t.create(db.collection(C.categorySlugs).doc(slug), { category_id: id });
    }
    t.update(ref, patch);
    audit(db, t, { actor: user.id, type: 'CATEGORY_UPDATED', meta: { category_id: id, ...patch } });
    return { ...cur, ...patch };
  });
  const sops = await db.collection(C.sops).where('category_id', '==', id).count().get();
  const category: Category = {
    id,
    name: saved.name,
    slug: saved.slug,
    parent_id: saved.parent_id,
    sort_order: saved.sort_order,
    sop_count: sops.data().count,
  };
  return { category };
}

/** Max SOPs moved by one delete (each move = SOP update + its audit entry; a transaction allows 500 writes). */
const MAX_MOVED_SOPS = 200;

/**
 * Delete a category. Its SOPs are moved to `move_to` (another category, or null = no category);
 * a category that still has sub-categories cannot be deleted.
 */
export async function deleteCategory(user: AuthUser, id: string, body: Record<string, unknown>) {
  requireRole(user, 'ADMIN');
  const moveProvided = Object.prototype.hasOwnProperty.call(body, 'move_to');
  const moveTo = moveProvided && body.move_to ? uuid(body.move_to, 'หมวดปลายทาง') : null;
  if (moveTo === id) throw badRequest('หมวดปลายทางต้องไม่ใช่หมวดที่จะลบ');

  const db = await getDb();
  const ref = db.collection(C.categories).doc(id);
  const moved = await db.runTransaction(async (t) => {
    const [cur, sops, children, target] = await Promise.all([
      t.get(ref).then((s) => data<CategoryDoc>(s)),
      t.get(db.collection(C.sops).where('category_id', '==', id).select()),
      t.get(db.collection(C.categories).where('parent_id', '==', id).select()),
      moveTo ? t.get(db.collection(C.categories).doc(moveTo)) : null,
    ]);
    if (!cur) throw notFound('ไม่พบหมวดหมู่');
    if (!children.empty) {
      throw conflict(`ลบไม่ได้ — มีหมวดย่อย ${children.size} หมวด กรุณาย้ายหรือลบหมวดย่อยก่อน`, 'HAS_CHILDREN');
    }
    if (!sops.empty && !moveProvided) {
      throw conflict(`มี SOP ในหมวดนี้ ${sops.size} ฉบับ กรุณาเลือกหมวดที่จะย้ายไป`, 'CATEGORY_IN_USE');
    }
    if (sops.size > MAX_MOVED_SOPS) {
      throw badRequest(`มี SOP ในหมวดนี้มากกว่า ${MAX_MOVED_SOPS} ฉบับ กรุณาแบ่งย้ายก่อนลบ`);
    }
    if (target && !target.exists) throw badRequest('ไม่พบหมวดปลายทางที่เลือก');

    for (const s of sops.docs) {
      // Category is SOP metadata, not versioned content: moving it does not touch any version.
      t.update(s.ref, { category_id: moveTo });
      audit(db, t, { actor: user.id, sop: s.id, type: 'CATEGORY_CHANGED', meta: { from: id, to: moveTo } });
    }
    t.delete(ref);
    t.delete(db.collection(C.categorySlugs).doc(cur.slug));
    audit(db, t, {
      actor: user.id,
      type: 'CATEGORY_DELETED',
      meta: { category_id: id, name: cur.name, slug: cur.slug, moved_sops: sops.size, move_to: moveTo },
    });
    return sops.size;
  });
  return { ok: true, moved };
}
