'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Award, ChevronRight, Clock3, Palette } from 'lucide-react';
import {
  Empty,
  FilterTabs,
  More,
  ResourceState,
  groupByDate,
  timeLabel,
  usePagedResource,
  type ActivityItem,
} from './shared';

export function ActivitySection() {
  const [type, setType] = useState('all');
  const resource = usePagedResource<ActivityItem>(
    `/api/profile-hub?kind=activity&type=${type}`,
  );
  return (
    <>
      <p className="hub-lead">
        Полученные награды и последние сохранённые просмотры. Повторное
        сохранение серии обновляет её запись.
      </p>
      <FilterTabs
        options={[
          ['all', 'Все'],
          ['watch', 'Просмотры'],
          ['achievement', 'Достижения'],
          ['cosmetic', 'Предметы'],
        ]}
        value={type}
        onChange={setType}
        label="Типы активности"
      />
      <ResourceState {...resource} />
      {!resource.loading &&
        !resource.error &&
        (resource.items.length ? (
          groupByDate(resource.items, (item) => item.date).map(
            ([day, items]) => (
              <section key={day}>
                <h2 className="hub-date">{day}</h2>
                {items.map((item) => {
                  const Icon =
                    item.kind === 'watch'
                      ? Clock3
                      : item.kind === 'achievement'
                        ? Award
                        : Palette;
                  return (
                    <article className="hub-event" key={item.id}>
                      <span>
                        <Icon size={22} aria-hidden="true" />
                      </span>
                      <div>
                        <strong>
                          {item.kind === 'watch'
                            ? `Сохранён просмотр серии ${item.episode}`
                            : item.kind === 'achievement'
                              ? 'Получено достижение'
                              : 'Получен предмет'}
                        </strong>
                        <p>{item.title}</p>
                        <small>{timeLabel(item.date)}</small>
                      </div>
                      {item.anime_id && (
                        <Link
                          className="hub-icon-button"
                          href={`/anime/${item.anime_id}?episode=${item.episode}`}
                          aria-label={`Открыть ${item.title}, серия ${item.episode}`}
                        >
                          <ChevronRight />
                        </Link>
                      )}
                    </article>
                  );
                })}
              </section>
            ),
          )
        ) : (
          <Empty>Событий этого типа пока нет.</Empty>
        ))}
      <More {...resource} />
    </>
  );
}
