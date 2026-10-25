import { requireUser } from '@/lib/server/auth';
import { idParam, route } from '@/lib/server/http';
import { getSopDetail } from '@/lib/server/sops';

type Ctx = { params: Promise<{ id: string }> };

/** SOP + the versions the caller may see; `?version=` selects one, otherwise the most relevant. */
export const GET = route<Ctx>(async (req, { params }) => {
  const user = await requireUser(req);
  const { id } = await params;
  const v = req.nextUrl.searchParams.get('version');
  return getSopDetail(user, idParam(id), v ? idParam(v) : null);
});
