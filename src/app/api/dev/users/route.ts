import { devAuthEnabled } from '@/lib/server/auth';
import { getDb } from '@/lib/server/db';
import { notFound, route } from '@/lib/server/http';

/** Demo accounts for the local dev login screen. Disabled outside `next dev` + NEXT_PUBLIC_AUTH_MODE=dev. */
export const GET = route(async () => {
  if (!devAuthEnabled()) throw notFound();
  const db = await getDb();
  const { rows } = await db.query(
    `select email, full_name, role from app_users where is_active
      order by case role when 'ADMIN' then 0 when 'AUTHOR' then 1 when 'REVIEWER' then 2
               when 'APPROVER' then 3 else 4 end, email`,
  );
  return { users: rows };
});
