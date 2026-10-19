import { isSocialProvider } from '@/lib/social-auth';
import { finishSocialAuth } from '@/lib/server/social-auth';

export async function GET(
  request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const { provider } = await context.params;
  if (!isSocialProvider(provider))
    return Response.json({ error: 'Не найдено' }, { status: 404 });
  return finishSocialAuth(request, provider);
}
