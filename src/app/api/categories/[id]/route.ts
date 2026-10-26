import { deleteCategory, updateCategory } from '@/lib/server/admin';
import { requireUser } from '@/lib/server/auth';
import { idParam, readJson, route } from '@/lib/server/http';

type Ctx = { params: Promise<{ id: string }> };

/** Rename / change code / change parent (ADMIN). */
export const PATCH = route<Ctx>(async (req, { params }) => {
  const user = await requireUser(req);
  const { id } = await params;
  return updateCategory(user, idParam(id), await readJson(req));
});

/** Delete a category, moving its SOPs to `move_to` (another category id, or null). Body: { move_to? } (ADMIN) */
export const DELETE = route<Ctx>(async (req, { params }) => {
  const user = await requireUser(req);
  const { id } = await params;
  return deleteCategory(user, idParam(id), await readJson(req));
});
