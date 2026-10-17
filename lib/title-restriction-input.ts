export function parseTitleRestrictionLinks(value: unknown) {
  if (typeof value !== 'string' || value.length > 12000)
    throw new Error('Вставьте ссылки на тайтлы, каждую с новой строки.');
  const lines = value.trim().split(/\s+/).filter(Boolean);
  if (!lines.length || lines.length > 100)
    throw new Error('За один раз можно добавить от 1 до 100 ссылок.');
  const unique = new Map<number, { animeId: number; sourceUrl: string }>();
  for (const line of lines) {
    const input = /^\d+$/.test(line) ? `/anime/${line}` : line;
    let url: URL;
    try {
      url = new URL(input, 'https://animonster.su');
    } catch {
      throw new Error(`Некорректная ссылка: ${line.slice(0, 120)}`);
    }
    const match = /^\/anime\/(\d{1,9})(?:-[a-z0-9-]+)?\/?$/.exec(url.pathname);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      !['animonster.su', 'www.animonster.su'].includes(url.hostname) ||
      url.username ||
      url.password ||
      url.port ||
      !match ||
      Number(match[1]) < 1
    )
      throw new Error(
        `Нужна ссылка вида https://animonster.su/anime/123: ${line.slice(0, 120)}`,
      );
    const animeId = Number(match[1]);
    unique.set(animeId, {
      animeId,
      sourceUrl: `https://animonster.su/anime/${animeId}`,
    });
  }
  return [...unique.values()];
}
