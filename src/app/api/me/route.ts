import { requireUser } from '@/lib/server/auth';
import { getDb } from '@/lib/server/db';
import { route } from '@/lib/server/http';
import { pendingCount } from '@/lib/server/sops';
import type { Me } from '@/lib/shared/types';

export const GET = route(async (req): Promise<Me> => {
  const user = await requireUser(req);
  const db = await getDb();
  await db.query(
    `update app_users set last_login_at = now()
      where id = $1 and (last_login_at is null or last_login_at < now() - interval '5 minutes')`,
    [user.id],
  );
  return {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    role: user.role,
    pendingCount: await pendingCount(user),
  };
});
