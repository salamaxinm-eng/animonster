import { db, fail, json, viewer } from '@/lib/server/core';
import { plusEntitlements } from '@/lib/server/plus';

export async function GET(request: Request) {
  try {
    const user = await viewer(request);
    const access = user ? await plusEntitlements(user.id) : { active: false };
    const collections = await db()
      .prepare(
        `SELECT id,title,description,cover,updated_at
         FROM editorial_collections WHERE published=1 ORDER BY updated_at DESC`,
      )
      .all();
    const result = [];
    for (const collection of collections.results as any[]) {
      const items = access.active
        ? (
            await db()
              .prepare(
                `SELECT i.anime_id,a.data FROM editorial_collection_items i
                 LEFT JOIN anime_cache a ON a.id=i.anime_id
                 WHERE i.collection_id=? ORDER BY i.position`,
              )
              .bind(collection.id)
              .all()
          ).results.map((item: any) => ({
            anime_id: Number(item.anime_id),
            anime: item.data ? JSON.parse(String(item.data)) : null,
          }))
        : [];
      result.push({ ...collection, locked: !access.active, items });
    }
    return json(result);
  } catch (error) {
    return fail(error);
  }
}
