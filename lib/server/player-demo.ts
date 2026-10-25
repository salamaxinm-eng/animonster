import { readFile } from 'node:fs/promises';
import { parseDemoCatalog, type DemoCatalog } from '../player-demo';
import { enrichDemoSkips } from './demo-skips';

export async function demoCatalog(): Promise<DemoCatalog | null> {
  if (process.env.PLAYER_DEMO_ENABLED !== 'true') return null;
  try {
    const file =
      process.env.PLAYER_DEMO_CATALOG ||
      '/var/lib/animonster-media/catalog.json';
    const catalog = parseDemoCatalog(
      JSON.parse(await readFile(/* turbopackIgnore: true */ file, 'utf8')),
    );
    return catalog.episodes.length ? enrichDemoSkips(catalog) : null;
  } catch (error) {
    console.error(
      'Player demo catalog unavailable',
      error instanceof Error ? error.name : 'Error',
    );
    return null;
  }
}
