import { fail, json, viewer } from '@/lib/server/core';
import { publicFounders } from '@/lib/server/founders';

export async function GET(request: Request) {
  try {
    const user = await viewer(request);
    return json(await publicFounders(user?.id));
  } catch (error) {
    return fail(error);
  }
}
