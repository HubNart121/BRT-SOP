import 'server-only';
import { ROLES, type AppUserRow, type Category, type Role } from '@/lib/shared/types';
import { audit } from './access';
import { devAuthEnabled, requireRole, type AuthUser } from './auth';
import { getDb } from './db';
import { adminAuth } from './firebase-admin';
import { badRequest, conflict, notFound, str, uuid } from './http';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function role(value: unknown): Role {
  if (typeof value !== 'string' || !ROLES.includes(value as Role)) throw badRequest('บทบาทไม่ถูกต้อง');
  return value as Role;
}

// ═══ Users ═════════════════════════════════════════════════════════════

export async function listUsers(user: AuthUser): Promise<AppUserRow[]> {
  requireRole(user, 'ADMIN');
  const db = await getDb();
  const { rows } = await db.query<AppUserRow>(
    `select id, email, full_name, role, is_active, (firebase_uid is not null) as firebase_linked,
            last_login_at, created_at
       from app_users
      order by is_active desc, case role when 'ADMIN' then 0 when 'APPROVER' then 1 when 'REVIEWER' then 2
               when 'AUTHOR' then 3 else 4 end, full_name, email`,
  );
  return rows;
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
  const exists = await db.query(`select 1 from app_users where email = $1`, [email]);
  if (exists.rows[0]) throw conflict('อีเมลนี้มีอยู่ในระบบแล้ว', 'DUPLICATE_EMAIL');

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

  const created = await db.tx(async (q) => {
    const { rows } = await q.query<AppUserRow>(
      `insert into app_users (email, full_name, role, firebase_uid) values ($1, $2, $3, $4)
       returning id, email, full_name, role, is_active, (firebase_uid is not null) as firebase_linked,
                 last_login_at, created_at`,
      [email, fullName, r, firebaseUid],
    );
    await audit(q, { actor: user.id, type: 'USER_INVITED', meta: { user_id: rows[0].id, email, role: r } });
    return rows[0];
  });
  return { user: created, warning, firebaseAccount };
}

export async function updateUser(user: AuthUser, id: string, body: Record<string, unknown>) {
  requireRole(user, 'ADMIN');
  const db = await getDb();
  return db.tx(async (q) => {
    const cur = await q.query(`select id, role, is_active from app_users where id = $1 for update`, [id]);
    const target = cur.rows[0];
    if (!target) throw notFound('ไม่พบผู้ใช้');

    const next = {
      full_name: body.full_name !== undefined ? str(body.full_name, 'ชื่อ-นามสกุล', { max: 120 }) : undefined,
      role: body.role !== undefined ? role(body.role) : undefined,
      is_active: body.is_active !== undefined ? body.is_active === true : undefined,
    };
    const losesAdmin =
      target.role === 'ADMIN' &&
      target.is_active &&
      ((next.role && next.role !== 'ADMIN') || next.is_active === false);
    if (losesAdmin) {
      if (id === user.id) throw badRequest('ไม่สามารถลดสิทธิ์หรือระงับบัญชีผู้ดูแลระบบของตนเองได้');
      // Serialize admin changes so two concurrent requests cannot remove the last admins.
      const admins = await q.query(`select id from app_users where role = 'ADMIN' and is_active for update`);
      if (admins.rows.length <= 1) throw badRequest('ต้องมีผู้ดูแลระบบที่ใช้งานอยู่อย่างน้อย 1 คน');
    }

    const { rows } = await q.query<AppUserRow>(
      `update app_users
          set full_name = coalesce($2, full_name), role = coalesce($3, role),
              is_active = coalesce($4, is_active), updated_at = now()
        where id = $1
        returning id, email, full_name, role, is_active, (firebase_uid is not null) as firebase_linked,
                  last_login_at, created_at`,
      [id, next.full_name ?? null, next.role ?? null, next.is_active ?? null],
    );
    await audit(q, { actor: user.id, type: 'USER_UPDATED', meta: { user_id: id, ...next } });
    return { user: rows[0] };
  });
}

// ═══ Categories ════════════════════════════════════════════════════════

export async function listCategories(): Promise<Category[]> {
  const db = await getDb();
  const { rows } = await db.query<Category>(
    `select c.id, c.name, c.slug, c.parent_id, c.sort_order,
            (select count(*)::int from sop_category_links l where l.category_id = c.id) as sop_count
       from sop_categories c
      order by c.sort_order, c.name`,
  );
  return rows;
}

export async function createCategory(user: AuthUser, body: Record<string, unknown>) {
  requireRole(user, 'ADMIN');
  const name = str(body.name, 'ชื่อหมวดหมู่', { max: 80 });
  const slug = str(body.slug, 'รหัสหมวด', { max: 40 }).toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(slug)) throw badRequest('รหัสหมวดใช้ได้เฉพาะ a-z, 0-9 และ - เช่น qc หรือ after-sales');
  const parentId = body.parent_id ? uuid(body.parent_id, 'หมวดหลัก') : null;

  const db = await getDb();
  try {
    return await db.tx(async (q) => {
      if (parentId) {
        const p = await q.query(`select 1 from sop_categories where id = $1`, [parentId]);
        if (!p.rows[0]) throw badRequest('ไม่พบหมวดหลักที่เลือก');
      }
      const { rows } = await q.query<Category>(
        `insert into sop_categories (name, slug, parent_id, sort_order)
         values ($1, $2, $3, (select coalesce(max(sort_order), 0) + 10 from sop_categories))
         returning id, name, slug, parent_id, sort_order, 0 as sop_count`,
        [name, slug, parentId],
      );
      await audit(q, { actor: user.id, type: 'CATEGORY_CREATED', meta: { category_id: rows[0].id, name, slug } });
      return { category: rows[0] };
    });
  } catch (err) {
    if ((err as { code?: string }).code === '23505') throw conflict('รหัสหมวดนี้มีอยู่แล้ว', 'DUPLICATE_SLUG');
    throw err;
  }
}
