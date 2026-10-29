'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Award, Check, Folder, LockKeyhole } from 'lucide-react';
import type { AchievementFolder } from '@/lib/achievement-folders';
import {
  Art,
  Empty,
  FilterTabs,
  Progress,
  ResourceState,
  dateLabel,
  useResource,
  type Achievement,
} from './shared';

export function AchievementsSection() {
  const params = useSearchParams();
  const resource = useResource<{
    achievements: Achievement[];
    folders: AchievementFolder[];
    completed_episodes: number;
    one_piece?: {
      count: number;
      xp: number;
      rank: string;
      unlocked: number;
      total: number;
    };
  }>('/api/achievements');
  const folders = resource.data?.folders || [];
  // Old links keep working; the old aggregate "anime" URL opens the folder list.
  const requested =
    params.get('folder') === 'one-piece' ? 'anime-21' : params.get('folder');
  const folder = folders.find((item) => item.id === requested);
  const [filter, setFilter] = useState('all');
  useEffect(() => {
    setFilter('all');
  }, [folder?.id]);
  const allItems = resource.data?.achievements || [];
  const items = allItems.filter(
    (item) => folder?.id === 'all' || item.folder === folder?.id,
  );
  const completed = items.filter((item) => item.completed).length;
  const filtered = items.filter(
    (item) =>
      filter === 'all' ||
      (filter === 'earned'
        ? item.completed
        : !item.completed && item.progress > 0),
  );
  return (
    <>
      <ResourceState {...resource} />
      {!resource.loading && !resource.error && (
        <>
          {!folder ? (
            <>
              <p>Выберите папку, чтобы посмотреть достижения и награды.</p>
              <nav
                className="hub-achievement-folders"
                aria-label="Папки достижений"
              >
                {folders.map(
                  ({ id, name, description, total, completed: earned }) => {
                    return (
                      <Link
                        className="hub-achievement-folder"
                        key={id}
                        href={`/profile?section=achievements&folder=${id}`}
                      >
                        <Folder size={30} aria-hidden="true" />
                        <strong>{name}</strong>
                        <span>{description}</span>
                        <small>
                          Получено {earned} из {total}
                        </small>
                        <Progress
                          value={earned}
                          total={total}
                          label={`Прогресс папки ${name}`}
                        />
                      </Link>
                    );
                  },
                )}
              </nav>
            </>
          ) : (
            <>
              <Link
                className="hub-achievement-back"
                href="/profile?section=achievements"
              >
                ← Все папки
              </Link>
              <h2>{folder.name}</h2>
              {(folder.anime_id === 21 || folder.id === 'all') && (
                <a
                  href="/achievements/one-piece"
                  className="hub-achievement-total"
                >
                  🏴‍☠️ Пиратский путь One Piece ·{' '}
                  {resource.data?.one_piece?.rank || 'Открыть путешествие'}
                  <span>
                    {resource.data?.one_piece?.unlocked || 0} /{' '}
                    {resource.data?.one_piece?.total ?? 0} достижений → Карта
                    Гранд Лайн
                  </span>
                </a>
              )}
              <div className="hub-achievement-total">
                Получено {completed} из {items.length}
                <Progress
                  value={completed}
                  total={items.length}
                  label="Полученные достижения"
                />
              </div>
              <FilterTabs
                options={[
                  ['all', `Все · ${items.length}`],
                  ['earned', `Полученные · ${completed}`],
                  [
                    'progress',
                    `В процессе · ${items.filter((item) => !item.completed && item.progress > 0).length}`,
                  ],
                ]}
                value={filter}
                onChange={setFilter}
                label="Фильтры достижений"
              />
              {filtered.length ? (
                <div className="hub-achievement-grid">
                  {filtered.map((item) => (
                    <article
                      className={`hub-achievement ${item.completed ? 'earned' : ''}`}
                      key={item.id}
                    >
                      {item.rewards[0]?.image ? (
                        <Art src={item.rewards[0].image} />
                      ) : (
                        <Award size={36} aria-hidden="true" />
                      )}
                      <div>
                        <div className="hub-achievement-name">
                          <strong>{item.name}</strong>
                          {item.completed ? (
                            <Check size={18} aria-label="Получено" />
                          ) : (
                            <LockKeyhole size={16} aria-label="Не получено" />
                          )}
                        </div>
                        <p>{item.description}</p>
                        <small>
                          {item.completed
                            ? `Получено${item.unlocked_at ? ` ${dateLabel(item.unlocked_at)}` : ''}`
                            : `${Math.min(item.progress, item.threshold)} из ${item.threshold}`}
                        </small>
                        <Progress
                          value={item.progress}
                          total={item.threshold}
                          label={`Прогресс ${item.name}`}
                        />
                        {!!item.rewards.length && (
                          <details>
                            <summary>Награды</summary>
                            <ul>
                              {item.rewards.map((reward) => (
                                <li key={reward.slug}>{reward.name}</li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <Empty>В этом фильтре пока нет достижений.</Empty>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}
