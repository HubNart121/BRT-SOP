import { createCategory, listCategories } from '@/lib/server/admin';
import { requireUser } from '@/lib/server/auth';
import { readJson, route } from '@/lib/server/http';

export const GET = route(async (req) => {
  await requireUser(req);
  return { categories: await listCategories() };
});

export const POST = route(async (req) => {
  const user = await requireUser(req);
  return createCategory(user, await readJson(req));
});
