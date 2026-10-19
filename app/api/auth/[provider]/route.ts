import { isSocialProvider } from '@/lib/social-auth';
import { startSocialAuth } from '@/lib/server/social-auth';

type Context = { params: Promise<{ provider: string }> };
export async function GET(request: Request, context: Context) {
  const { provider } = await context.params;
  if (!isSocialProvider(provider))
    return Response.json({ error: 'Не найдено' }, { status: 404 });
  return startSocialAuth(request, provider);
}
export async function POST(request: Request, context: Context) {
  const { provider } = await context.params;
  if (!isSocialProvider(provider))
    return Response.json({ error: 'Не найдено' }, { status: 404 });
  return startSocialAuth(request, provider);
}
