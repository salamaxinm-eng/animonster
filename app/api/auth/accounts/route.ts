import { db, fail, json, requireUser } from '@/lib/server/core';

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const rows = await db()
      .prepare(
        "SELECT provider FROM auth_identities WHERE user_id=? AND provider IN ('google','telegram')",
      )
      .bind(user.id)
      .all<{ provider: string }>();
    return json({
      google: rows.results.some((row) => row.provider === 'google'),
      telegram: rows.results.some((row) => row.provider === 'telegram'),
    });
  } catch (error) {
    return fail(error);
  }
}
