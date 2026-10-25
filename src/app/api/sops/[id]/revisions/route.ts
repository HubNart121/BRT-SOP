import { requireUser } from '@/lib/server/auth';
import { idParam, route } from '@/lib/server/http';
import { createRevision } from '@/lib/server/sops';

type Ctx = { params: Promise<{ id: string }> };

/** Create a new draft revision from the published version. */
export const POST = route<Ctx>(async (req, { params }) => {
  const user = await requireUser(req);
  const { id } = await params;
  return createRevision(user, idParam(id));
});
