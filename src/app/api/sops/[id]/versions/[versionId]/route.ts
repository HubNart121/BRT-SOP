import { requireUser } from '@/lib/server/auth';
import { idParam, readJson, route } from '@/lib/server/http';
import { getSopDetail, saveDraft } from '@/lib/server/sops';

type Ctx = { params: Promise<{ id: string; versionId: string }> };

export const GET = route<Ctx>(async (req, { params }) => {
  const user = await requireUser(req);
  const { id, versionId } = await params;
  return getSopDetail(user, idParam(id), idParam(versionId));
});

/** Save a draft (title, content, category). */
export const PATCH = route<Ctx>(async (req, { params }) => {
  const user = await requireUser(req);
  const { id, versionId } = await params;
  return saveDraft(user, idParam(id), idParam(versionId), await readJson(req, 3_000_000));
});
