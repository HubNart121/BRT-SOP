import { requireUser } from '@/lib/server/auth';
import { route } from '@/lib/server/http';
import { dashboard } from '@/lib/server/sops';

export const GET = route(async (req) => {
  const user = await requireUser(req);
  return dashboard(user);
});
