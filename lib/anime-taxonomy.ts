export const tagKey = (value: string) =>
  value
    .trim()
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .replace(/^исэкай$/, 'исекай');

export function themeAliases(value: string) {
  return tagKey(value) === 'исекай' ? ['Исекай', 'Исэкай'] : [value];
}

export function uniqueTags(values: string[]) {
  const seen = new Set<string>();
  return values
    .filter((value) => {
      const key = tagKey(value);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((value) => value.trim());
}

export function partitionTags(values: string[], knownThemes: string[]) {
  const themeKeys = new Set(knownThemes.map(tagKey));
  const tags = uniqueTags(values);
  return {
    genres: tags.filter((value) => !themeKeys.has(tagKey(value))),
    themes: tags.filter((value) => themeKeys.has(tagKey(value))),
  };
}
