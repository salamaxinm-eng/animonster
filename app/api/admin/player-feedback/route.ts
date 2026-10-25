import { ApiError, fail, json, viewer } from '@/lib/server/core';
import { feedbackResults } from '@/lib/server/demo-feedback';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const user = await viewer(request);
    if (user?.role !== 'admin') throw new ApiError('Не найдено', 404);
    const offset = Number(new URL(request.url).searchParams.get('offset') || 0);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 10000)
      throw new ApiError('Некорректная страница');
    return json(await feedbackResults(offset));
  } catch (error) {
    return fail(error);
  }
}
