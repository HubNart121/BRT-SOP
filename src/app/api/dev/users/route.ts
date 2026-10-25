import { devAuthEnabled } from '@/lib/server/auth';
import { C, getDb, type UserDoc } from '@/lib/server/db';
import { notFound, route } from '@/lib/server/http';
import type { Role } from '@/lib/shared/types';

const ORDER: Record<Role, number> = { ADMIN: 0, AUTHOR: 1, REVIEWER: 2, APPROVER: 3, VIEWER: 4 };

/** Demo accounts for the local dev login screen. Disabled outside `next dev` + NEXT_PUBLIC_AUTH_MODE=dev. */
export const GET = route(async () => {
  if (!devAuthEnabled()) throw notFound();
  const db = await getDb();
  const snap = await db.collection(C.users).where('is_active', '==', true).get();
  const users = snap.docs
    .map((d) => d.data() as UserDoc)
    .map((u) => ({ email: u.email, full_name: u.full_name, role: u.role }))
    .sort((a, b) => ORDER[a.role] - ORDER[b.role] || a.email.localeCompare(b.email));
  return { users };
});
