'use client';
import { useState } from 'react';
import { Award, Check, LockKeyhole } from 'lucide-react';
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
  const resource = useResource<{
    achievements: Achievement[];
    completed_episodes: number;
    one_piece?: { count:number; xp:number; rank:string; unlocked:number; total:number };
  }>('/api/achievements');
  const [filter, setFilter] = useState('all');
  const items = resource.data?.achievements || [];
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
          <a href="/achievements/one-piece" className="hub-achievement-total">🏴‍☠️ Пиратский путь One Piece · {resource.data?.one_piece?.rank || 'Открыть путешествие'}<span>{resource.data?.one_piece?.unlocked || 0} / {resource.data?.one_piece?.total || 44} достижений → Карта Гранд Лайн</span></a>
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
  );
}
