'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Award, Check, Folder, LockKeyhole } from 'lucide-react';
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

const folders = [
  ['one-piece', 'Ван-Пис', 'Пиратский путь, арки и награды One Piece'],
  ['anime', 'Другие аниме', 'Достижения за просмотр отдельных тайтлов'],
  ['other', 'Прочее', 'Общий прогресс и количество просмотренных серий'],
  ['all', 'Все достижения', 'Вся коллекция в одном списке'],
] as const;

export function AchievementsSection() {
  const params = useSearchParams();
  const folder = folders.find(([id]) => id === params.get('folder'));
  const resource = useResource<{
    achievements: Achievement[];
    completed_episodes: number;
    one_piece?: {
      count: number;
      xp: number;
      rank: string;
      unlocked: number;
      total: number;
    };
  }>('/api/achievements');
  const [filter, setFilter] = useState('all');
  const allItems = resource.data?.achievements || [];
  const items = allItems.filter(
    (item) => folder?.[0] === 'all' || item.folder === folder?.[0],
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
                {folders.map(([id, title, description]) => {
                  const group = allItems.filter(
                    (item) => id === 'all' || item.folder === id,
                  );
                  const earned = group.filter((item) => item.completed).length;
                  return (
                    <Link
                      className="hub-achievement-folder"
                      key={id}
                      href={`/profile?section=achievements&folder=${id}`}
                    >
                      <Folder size={30} aria-hidden="true" />
                      <strong>{title}</strong>
                      <span>{description}</span>
                      <small>
                        Получено {earned} из {group.length}
                      </small>
                      <Progress
                        value={earned}
                        total={group.length}
                        label={`Прогресс папки ${title}`}
                      />
                    </Link>
                  );
                })}
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
              <h2>{folder[1]}</h2>
              {(folder[0] === 'one-piece' || folder[0] === 'all') && (
                <a
                  href="/achievements/one-piece"
                  className="hub-achievement-total"
                >
                  🏴‍☠️ Пиратский путь One Piece ·{' '}
                  {resource.data?.one_piece?.rank || 'Открыть путешествие'}
                  <span>
                    {resource.data?.one_piece?.unlocked || 0} /{' '}
                    {resource.data?.one_piece?.total || 44} достижений → Карта
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
