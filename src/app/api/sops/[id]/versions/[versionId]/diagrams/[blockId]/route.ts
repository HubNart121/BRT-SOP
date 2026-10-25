import { requireUser } from '@/lib/server/auth';
import { idParam, readJson, route } from '@/lib/server/http';
import { saveDiagram } from '@/lib/server/sops';

type Ctx = { params: Promise<{ id: string; versionId: string; blockId: string }> };

/** Store draw.io XML + PNG preview for one diagram block of a draft version. */
export const PUT = route<Ctx>(async (req, { params }) => {
  const user = await requireUser(req);
  const { id, versionId, blockId } = await params;
  const diagram = await saveDiagram(user, idParam(id), idParam(versionId), blockId, await readJson(req, 8_000_000));
  return { diagram };
});
