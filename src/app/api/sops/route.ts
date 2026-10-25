import { requireUser } from '@/lib/server/auth';
import { readJson, route, uuid } from '@/lib/server/http';
import { createSop, listSops } from '@/lib/server/sops';

export const GET = route(async (req) => {
  const user = await requireUser(req);
  const sp = req.nextUrl.searchParams;
  const category = sp.get('category');
  return {
    sops: await listSops(user, {
      q: sp.get('q') ?? '',
      categoryId: category ? uuid(category, 'หมวดหมู่') : null,
      orderBy: sp.get('order') === 'recent' ? 'recent' : 'code',
    }),
  };
});

export const POST = route(async (req) => {
  const user = await requireUser(req);
  return createSop(user, await readJson(req));
});
