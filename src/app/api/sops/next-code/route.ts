import { requireUser } from '@/lib/server/auth';
import { route, uuid } from '@/lib/server/http';
import { nextSopCode } from '@/lib/server/sops';

/** Preview of the code the next SOP in `?category=` would get (not reserved). */
export const GET = route(async (req) => {
  const user = await requireUser(req);
  return nextSopCode(user, uuid(req.nextUrl.searchParams.get('category'), 'หมวดหมู่'));
});
