'use client';
import Link from 'next/link';
import { Award, Bookmark, ChevronRight, Play } from 'lucide-react';
import type { HubProfile, HistoryItem } from './shared';
import {
  Art,
  Empty,
  Progress,
  ResourceState,
  durationLabel,
  sectionHref,
  useResource,
} from './shared';
import { ProfileIdentity } from './profile-identity';
import { Comments } from '../comments';
import { StreakDisplay } from '../streak-display';

type Overview = {
  summary: {
    anime_count: number;
    completed_episodes: number;
    watched_seconds: number;
  };
  favorites: Array<{ anime_id: number; title: string; image: string }>;
  continue: HistoryItem[];
};
export function OverviewSection({
  profile,
  revision,
}: {
  profile: HubProfile;
  revision: number;
}) {
  const resource = useResource<Overview>(
    '/api/profile-hub?kind=overview',
    revision,
  );
  const user = profile.user;
  return (
    <>
      <ProfileIdentity user={user} own />
      <ResourceState {...resource} />
      {resource.data && (
        <>
          <div className="hub-stats">
            <span>
              <strong>{Number(resource.data.summary.anime_count)}</strong>Аниме
              в списке
            </span>
            <span>
              <strong>
                {Number(resource.data.summary.completed_episodes)}
              </strong>
              Серий просмотрено
            </span>
            <span>
              <strong>{user.streak.current}</strong>Дней подряд
            </span>
          </div>
          <div className="hub-section-title">
            <h2>Продолжить просмотр</h2>
            <Link href={sectionHref('history')}>
              Все <ChevronRight size={16} />
            </Link>
          </div>
          {resource.data.continue.length ? (
            <div className="hub-continue-grid">
              {resource.data.continue.map((item) => (
                <Link
                  className="hub-continue"
                  href={`/anime/${item.anime_id}?episode=${item.episode}`}
                  key={item.anime_id}
                >
                  <Art src={item.image} />
                  <div>
                    <strong>{item.title}</strong>
                    <span>
                      Серия {item.episode} · {durationLabel(item.position)} /{' '}
                      {durationLabel(item.duration)}
                    </span>
                    <Progress
                      value={item.position}
                      total={item.duration}
                      label={`Прогресс серии ${item.title}`}
                    />
                  </div>
                  <Play size={20} aria-hidden="true" />
                </Link>
              ))}
            </div>
          ) : (
            <Empty>После начала просмотра здесь появятся ваши серии.</Empty>
          )}
          {!!resource.data.favorites.length && (
            <>
              <div className="hub-section-title">
                <h2>Любимые аниме</h2>
                <Link href={sectionHref('list')}>
                  Мой список <ChevronRight size={16} />
                </Link>
              </div>
              <div className="hub-showcase">
                {resource.data.favorites.map((item) => (
                  <Link href={`/anime/${item.anime_id}`} key={item.anime_id}>
                    <Art src={item.image} />
                    <span>{item.title}</span>
                  </Link>
                ))}
              </div>
            </>
          )}
        </>
      )}
      {(!!profile.anime_showcase.length ||
        !!profile.character_showcase.length) && (
        <>
          <div className="hub-section-title">
            <h2>Витрина Plus</h2>
            <Link href="/profile?section=appearance&showcase=1">
              Настроить <ChevronRight size={16} />
            </Link>
          </div>
          <div className="hub-showcase">
            {profile.anime_showcase.map((item) => (
              <Link
                href={`/anime/${item.anime_id}`}
                key={`anime-${item.anime_id}`}
              >
                <Art src={item.anime?.image.original} />
                <span>
                  {item.anime?.russian ||
                    item.anime?.name ||
                    `Аниме #${item.anime_id}`}
                </span>
              </Link>
            ))}
            {profile.character_showcase.map((item) => (
              <article key={`character-${item.id}`}>
                <Art src={item.image} />
                <span>{item.name}</span>
              </article>
            ))}
          </div>
        </>
      )}
      <div className="hub-quick">
        <Link href={sectionHref('list')}>
          <Bookmark />
          Мой список <ChevronRight />
        </Link>
        <Link href={sectionHref('achievements')}>
          <Award />
          Достижения <ChevronRight />
        </Link>
      </div>
      <div className="hub-profile-extras">
        <StreakDisplay streak={user.streak} />
        {profile.passport_public && (
          <Link className="hub-button" href="/passport">
            Аниме-паспорт
          </Link>
        )}
        <Link className="hub-button" href="/statistics">
          Статистика просмотра
        </Link>
        <Link className="hub-button" href={`/members/${user.id}`}>
          Публичный профиль
        </Link>
      </div>
      <section className="hub-wall">
        <h2>Стенка</h2>
        <Comments scope={`wall:${user.id}`} closed={!user.wall_open} />
      </section>
    </>
  );
}
