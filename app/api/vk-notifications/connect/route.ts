import { ApiError, fail, requireUser, sameOrigin } from '@/lib/server/core';
import { createVkConnection } from '@/lib/server/vk-notifications';

// A native form opens VK in a new tab directly from the user's click. No
// asynchronous window.open, popup permission, or copying a command is required.
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const user = await requireUser(request);
    const connection = await createVkConnection(user.id);
    return new Response(null, {
      status: 303,
      headers: {
        Location: connection.url,
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
      },
    });
  } catch (error) {
    if (error instanceof ApiError && error.code === 'email_not_verified') {
      return new Response(null, {
        status: 303,
        headers: { Location: '/verify-email', 'Cache-Control': 'no-store' },
      });
    }
    return fail(error);
  }
}
