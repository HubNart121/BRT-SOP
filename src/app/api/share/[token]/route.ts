import { route } from '@/lib/server/http';
import { getSharedSop } from '@/lib/server/shares';

type Ctx = { params: Promise<{ token: string }> };

/** PUBLIC (no login): the published version behind a valid, unexpired share token. */
export const GET = route<Ctx>(async (_req, { params }) => {
  const { token } = await params;
  return getSharedSop(token);
});
