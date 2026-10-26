import { deleteUser, updateUser } from '@/lib/server/admin';
import { requireUser } from '@/lib/server/auth';
import { idParam, readJson, route } from '@/lib/server/http';

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route<Ctx>(async (req, { params }) => {
  const user = await requireUser(req);
  const { id } = await params;
  return updateUser(user, idParam(id), await readJson(req));
});

/** Delete a user without history (ADMIN); users with history are suspended instead. */
export const DELETE = route<Ctx>(async (req, { params }) => {
  const user = await requireUser(req);
  const { id } = await params;
  return deleteUser(user, idParam(id));
});
