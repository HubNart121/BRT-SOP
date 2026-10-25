import { inviteUser, listUsers } from '@/lib/server/admin';
import { requireUser } from '@/lib/server/auth';
import { readJson, route } from '@/lib/server/http';

export const GET = route(async (req) => {
  const user = await requireUser(req);
  return { users: await listUsers(user) };
});

export const POST = route(async (req) => {
  const user = await requireUser(req);
  return inviteUser(user, await readJson(req));
});
