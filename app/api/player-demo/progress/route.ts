import { body, fail, json, requireUser, sameOrigin } from '@/lib/server/core';
import { getDemoProgress, saveDemoProgress } from '@/lib/server/demo-session';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    return json({ items: await getDemoProgress(user.id) });
  } catch (error) {
    return fail(error);
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const user = await requireUser(request);
    return json(await saveDemoProgress(user.id, await body(request)));
  } catch (error) {
    return fail(error);
  }
}
