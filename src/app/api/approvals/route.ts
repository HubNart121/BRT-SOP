import { requireUser } from '@/lib/server/auth';
import { route } from '@/lib/server/http';
import { listApprovals } from '@/lib/server/sops';

/** Pending review / approval steps assigned to the caller (ADMIN also sees everyone else's). */
export const GET = route(async (req) => {
  const user = await requireUser(req);
  return { tasks: await listApprovals(user) };
});
