import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';

globalThis.titleRestrictionsFixture = new Set([60058, 57334, 60543]);
const fixtureCoreUrl =
  'data:text/javascript;base64,' +
  Buffer.from(`
  export const db = () => ({ prepare: () => ({ bind: (...ids) => ({
    first: async () => ids.some(id => globalThis.titleRestrictionsFixture.has(id)) ? { anime_id: ids[0] } : null
  }) }) });
`).toString('base64');

export const titleRestrictionsUrl =
  'data:text/javascript;base64,' +
  Buffer.from(
    stripTypeScriptTypes(
      await readFile(
        new URL('../../lib/server/title-restrictions.ts', import.meta.url),
        'utf8',
      ),
    )
      .replace("'./core'", JSON.stringify(fixtureCoreUrl))
      .replace(
        "'../title-policy'",
        JSON.stringify(
          'data:text/javascript;base64,' +
            Buffer.from(
              stripTypeScriptTypes(
                await readFile(
                  new URL('../../lib/title-policy.ts', import.meta.url),
                  'utf8',
                ),
              ),
            ).toString('base64'),
        ),
      )
      .replace(
        "'geoip-country'",
        JSON.stringify(import.meta.resolve('geoip-country')),
      ),
  ).toString('base64');
