import { demoCatalog } from '@/lib/server/player-demo';

export const dynamic = 'force-dynamic';
export async function GET() {
  const catalog = await demoCatalog();
  return Response.json(
    catalog ? { catalog } : { error: 'Демо пока готовится' },
    {
      status: catalog ? 200 : 404,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
