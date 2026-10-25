import { requireUser } from '@/lib/server/auth';
import { idParam, readJson, route } from '@/lib/server/http';
import { decide } from '@/lib/server/sops';

type Ctx = { params: Promise<{ stepId: string }> };

/** Approve, or reject with a reason, a pending review / approval step. */
export const POST = route<Ctx>(async (req, { params }) => {
  const user = await requireUser(req);
  const { stepId } = await params;
  return decide(user, idParam(stepId), await readJson(req));
});
