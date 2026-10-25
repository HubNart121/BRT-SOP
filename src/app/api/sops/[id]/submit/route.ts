import { requireUser } from '@/lib/server/auth';
import { idParam, readJson, route } from '@/lib/server/http';
import { submitForReview } from '@/lib/server/sops';

type Ctx = { params: Promise<{ id: string }> };

/** Submit the draft into the review → approval workflow. */
export const POST = route<Ctx>(async (req, { params }) => {
  const user = await requireUser(req);
  const { id } = await params;
  return submitForReview(user, idParam(id), await readJson(req));
});
