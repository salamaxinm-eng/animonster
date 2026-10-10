export function normalizePassportGenre(name: string) {
  const key = name.trim().toLocaleLowerCase('ru-RU').replaceAll('ё', 'е');
  const aliases: Record<string, string> = {
    экшен: 'Экшен', action: 'Экшен', приключения: 'Приключения', adventure: 'Приключения',
    фэнтези: 'Фэнтези', fantasy: 'Фэнтези', фантастика: 'Фантастика', 'sci-fi': 'Фантастика',
    романтика: 'Романтика', romance: 'Романтика', комедия: 'Комедия', comedy: 'Комедия',
    драма: 'Драма', drama: 'Драма', сенен: 'Сёнен', shounen: 'Сёнен', shonen: 'Сёнен',
  };
  return aliases[key] || (key ? key[0].toLocaleUpperCase('ru-RU') + key.slice(1) : '');
}

export function passportArchetype(input: { episodes: number; anime: number; genres: number; ongoing: number; longest: number; night: number }) {
  if (input.episodes < 3) return { name: 'Начало истории', reason: 'Посмотрите несколько серий — характер паспорта проявится сам.' };
  if (input.episodes >= 1000) return { name: 'Легенда AniMonster', reason: 'Подтверждено не менее 1000 уникальных серий.' };
  if (input.ongoing >= 3 && input.ongoing / input.anime >= .6) return { name: 'Охотник за онгоингами', reason: 'Большинство просмотренных тайтлов ещё выходит.' };
  if (input.genres >= 8 && input.anime >= 8) return { name: 'Исследователь миров', reason: 'Просмотрены тайтлы как минимум восьми жанров.' };
  if (input.longest >= 75) return { name: 'Мастер марафонов', reason: 'У одного тайтла просмотрено не менее 75 серий.' };
  if (input.night >= 15 && input.night / input.episodes >= .5) return { name: 'Ночной зритель', reason: 'Не менее половины датированных серий завершены ночью.' };
  return { name: 'Коллекционер историй', reason: 'Ваш паспорт складывается из просмотренных историй.' };
}
