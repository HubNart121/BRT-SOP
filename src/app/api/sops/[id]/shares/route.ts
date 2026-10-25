import { requireUser } from '@/lib/server/auth';
import { idParam, readJson, route } from '@/lib/server/http';
import { createShareLink, listShareLinks } from '@/lib/server/shares';

type Ctx = { params: Promise<{ id: string }> };

/** Share links of this SOP (owner / ADMIN). */
export const GET = route<Ctx>(async (req, { params }) => {
  const user = await requireUser(req);
  const { id } = await params;
  return { links: await listShareLinks(user, idParam(id)) };
});

/** Create a public, expiring link to the published version. Body: { expiresAt: ISO, note? } */
export const POST = route<Ctx>(async (req, { params }) => {
  const user = await requireUser(req);
  const { id } = await params;
  return createShareLink(user, idParam(id), await readJson(req));
});
