export type AchievementFolder = {
  id: string;
  name: string;
  description: string;
  anime_id: number | null;
  total: number;
  completed: number;
};

export type ViewerAchievement = {
  id: string;
  title: string;
  current: number;
  target: number;
  unlocked: boolean;
  folder: string;
};

type FolderItem = {
  id: string;
  anime_id: number | null;
  anime_title?: string | null;
  description: string;
  completed: boolean;
};

export function groupAchievementFolders<T extends FolderItem>(items: T[]) {
  const folders = new Map<string, AchievementFolder>();
  const achievements = items.map((item) => {
    const animeId = item.anime_id;
    const id = animeId ? `anime-${animeId}` : 'other';
    if (!folders.has(id)) {
      const name =
        animeId === 21
          ? 'Ван-Пис'
          : animeId
            ? item.anime_title?.trim() ||
              item.description.match(/«([^»]+)»/)?.[1] ||
              `Аниме #${animeId}`
            : 'Прочее';
      folders.set(id, {
        id,
        name,
        anime_id: animeId,
        description: animeId
          ? `Достижения аниме «${name}»`
          : 'Общий прогресс просмотра',
        total: 0,
        completed: 0,
      });
    }
    const folder = folders.get(id)!;
    folder.total++;
    if (item.completed) folder.completed++;
    return { ...item, folder: id };
  });
  const summary = {
    total: achievements.length,
    completed: achievements.filter((x) => x.completed).length,
  };
  const ordered = [...folders.values()].sort((a, b) =>
    a.anime_id === 21
      ? -1
      : b.anime_id === 21
        ? 1
        : a.id === 'other'
          ? 1
          : b.id === 'other'
            ? -1
            : a.name.localeCompare(b.name, 'ru'),
  );
  return {
    achievements,
    summary,
    folders: [
      ...ordered,
      {
        id: 'all',
        name: 'Все достижения',
        description: 'Вся коллекция в одном списке',
        anime_id: null,
        ...summary,
      },
    ],
  };
}
