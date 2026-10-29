import { body, fail } from '@/lib/server/core';
import { vkBotCallback } from '@/lib/server/vk-notifications';
export async function POST(request: Request) {
  try {
    const result = await vkBotCallback(await body(request));
    return new Response(result, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return fail(error);
  }
}
