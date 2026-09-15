import type { LucideIcon } from 'lucide-react';
import {
  Bot,
  Brain,
  Compass,
  Cpu,
  Crown,
  Drama,
  Dumbbell,
  Flame,
  Gamepad2,
  Ghost,
  GraduationCap,
  Heart,
  HeartCrack,
  Landmark,
  Music2,
  Rocket,
  Search,
  Shield,
  Skull,
  Smile,
  Sparkles,
  Star,
  Swords,
  Users,
  Wand2,
  WandSparkles,
  Zap,
} from 'lucide-react';

import { CommunityHeader } from '@/components/community/context';
import { MobileCatalogTabs } from '@/components/mobile-catalog-tabs';
import { proxyImageUrl } from '@/lib/anime';
import { LIBERTY } from '@/lib/server/anime';
import { genreList, type Genre } from '@/lib/server/library';

export const metadata = {
  title: 'Жанры аниме — AniMonster',
  description: 'Выберите жанр и найдите аниме под настроение.',
};

export const dynamic = 'force-dynamic';

const order = [
  'Экшен',
  'Приключения',
  'Комедия',
  'Драма',
  'Фэнтези',
  'Музыка',
  'Романтика',
  'Фантастика',
  'Сейнен',
  'Сёдзе',
  'Сёнен',
  'Повседневность',
  'Спорт',
  'Мистика',
  'Триллер',
];

const icons: Record<string, LucideIcon> = {
  Экшен: Swords,
  Приключения: Compass,
  Комедия: Smile,
  Драма: HeartCrack,
  Фэнтези: WandSparkles,
  Музыка: Music2,
  Романтика: Heart,
  Фантастика: Rocket,
  Сейнен: Shield,
  Сёдзе: Crown,
  Сёнен: Flame,
  Повседневность: Star,
  Спорт: Dumbbell,
  Мистика: Ghost,
  Триллер: Brain,

  'Боевые искусства': Swords,
  Вампиры: Skull,
  Гарем: Users,
  Демоны: Flame,
  Детектив: Search,
  Дзёсей: Crown,
  Игры: Gamepad2,
  Исекай: Compass,
  Исторический: Landmark,
  Киберпанк: Cpu,
  Магия: Wand2,
  Меха: Bot,
  Пародия: Drama,
  Психологическое: Brain,
  Сверхъестественное: Sparkles,
  'Сёдзе-ай': Heart,
  'Супер сила': Zap,
  Ужасы: Skull,
  Школа: GraduationCap,
  Этти: Heart,
};

const genreBackgrounds: Record<string, string> = {
  Экшен: '/genres/action.jpg',
  Приключения: '/genres/adventure.jpg',
  Комедия: '/genres/comedy.jpg',
  Драма: '/genres/drama.jpg',
  Фэнтези: '/genres/fantasy.jpg',
  Музыка: '/genres/music.jpg',
  Романтика: '/genres/romance.jpg',
  Фантастика: '/genres/sci-fi.jpg',
  Сейнен: '/genres/seinen.jpg',
  Сёдзе: '/genres/shoujo.jpg',
  Сёнен: '/genres/shonen.jpg',
  Повседневность: '/genres/slice-of-life.jpg',
  Спорт: '/genres/sport.jpg',
  Мистика: '/genres/mystery.jpg',
  Триллер: '/genres/thriller.jpg',
};

function imageUrl(genre: Genre) {
  const path =
    genre.image?.optimized?.preview ||
    genre.image?.preview ||
    genre.image?.optimized?.thumbnail ||
    genre.image?.thumbnail;

  return path ? proxyImageUrl(new URL(path, LIBERTY).href) : '';
}

export default async function GenresPage() {
  let genres: Genre[] = [];

  try {
    genres = await genreList();
  } catch {
    genres = order.map((name, id) => ({
      id,
      name,
    }));
  }

  genres.sort((a, b) => {
    const ai = order.indexOf(a.name);
    const bi = order.indexOf(b.name);

    return (
      (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi) ||
      a.name.localeCompare(b.name, 'ru')
    );
  });

  return (
    <div className="social-site">
      <CommunityHeader />

      <main className="genre-hub">
        <MobileCatalogTabs active="genres" />

        <div className="genre-hub-heading">
          <p className="eyebrow">КАТАЛОГ ANIMONSTER</p>
          <h1>Жанры аниме</h1>
          <p>Выбери настроение — покажем все подходящие тайтлы.</p>
        </div>

        <nav className="genre-grid" aria-label="Жанры аниме">
          {genres.map((genre) => {
            const Icon = icons[genre.name] || Sparkles;

            const background =
              genreBackgrounds[genre.name] || imageUrl(genre);

            return (
              <a
                className="genre-tile"
                href={'/genres/' + encodeURIComponent(genre.name)}
                key={genre.id}
                style={
                  background
                    ? {
                        backgroundImage: `url(${JSON.stringify(background)})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        backgroundRepeat: 'no-repeat',
                      }
                    : undefined
                }
              >
                <span className="genre-tile-shade" />

                <span className="genre-tile-content">
                  <Icon aria-hidden="true" />

                  <strong>{genre.name}</strong>

                  {!!genre.total_releases && (
                    <small>{genre.total_releases} тайтлов</small>
                  )}
                </span>
              </a>
            );
          })}
        </nav>
      </main>
    </div>
  );
}