import { requireUser } from '@/lib/server/auth';
import { C, getDb, now } from '@/lib/server/db';
import { route } from '@/lib/server/http';
import { pendingCount } from '@/lib/server/sops';
import type { Me } from '@/lib/shared/types';

const LOGIN_TOUCH_MS = 5 * 60_000;

export const GET = route(async (req): Promise<Me> => {
  const user = await requireUser(req);
  const db = await getDb();
  const ref = db.collection(C.users).doc(user.id);
  const last = (await ref.get()).get('last_login_at');
  if (!last || Date.now() - last.toMillis() > LOGIN_TOUCH_MS) await ref.update({ last_login_at: now() });
  return {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    role: user.role,
    pendingCount: await pendingCount(user),
  };
});
