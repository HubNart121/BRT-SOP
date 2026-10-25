import { requireUser } from '@/lib/server/auth';
import { idParam, route } from '@/lib/server/http';
import { revokeShareLink } from '@/lib/server/shares';

type Ctx = { params: Promise<{ id: string; shareId: string }> };

/** Revoke a share link immediately. */
export const DELETE = route<Ctx>(async (req, { params }) => {
  const user = await requireUser(req);
  const { id, shareId } = await params;
  return revokeShareLink(user, idParam(id), idParam(shareId));
});
