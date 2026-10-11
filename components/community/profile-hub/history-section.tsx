'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Play } from 'lucide-react';
import {
  Art,
  Empty,
  More,
  Progress,
  ResourceState,
  SearchField,
  durationLabel,
  groupByDate,
  percentage,
  timeLabel,
  usePagedResource,
  type HistoryItem,
} from './shared';

export function HistorySection() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [days, setDays] = useState('all');
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), 200);
    return () => clearTimeout(timer);
  }, [search]);
  const resource = usePagedResource<HistoryItem>(
    `/api/profile-hub?kind=history&q=${encodeURIComponent(query)}&days=${days}`,
  );
  return (
    <>
      <p className="hub-lead">Сохранённые серии и позиция просмотра.</p>
      <div className="hub-filters">
        <SearchField
          value={search}
          onChange={setSearch}
          label="Поиск в истории просмотра"
        />
        <select
          value={days}
          onChange={(event) => setDays(event.target.value)}
          aria-label="Период истории"
        >
          <option value="all">Все даты</option>
          <option value="7">Последние 7 дней</option>
          <option value="30">Последние 30 дней</option>
        </select>
      </div>
      <ResourceState {...resource} />
      {!resource.loading &&
        !resource.error &&
        (resource.items.length ? (
          groupByDate(resource.items, (item) => item.updated_at).map(
            ([day, items]) => (
              <section key={day}>
                <h2 className="hub-date">{day}</h2>
                {items.map((item) => (
                  <article
                    className="hub-history-row"
                    key={`${item.anime_id}:${item.episode}`}
                  >
                    <Link
                      className="hub-history-art"
                      href={`/anime/${item.anime_id}?episode=${item.episode}`}
                    >
                      <Art src={item.image} />
                    </Link>
                    <div>
                      <strong>{item.title}</strong>
                      <span>Серия {item.episode}</span>
                      <small>Обновлено в {timeLabel(item.updated_at)}</small>
                      <Progress
                        value={item.position}
                        total={item.duration}
                        label={`Прогресс серии ${item.title}`}
                      />
                      <small>
                        {durationLabel(item.position)} /{' '}
                        {durationLabel(item.duration)} ·{' '}
                        {percentage(item.position, item.duration)}%
                      </small>
                    </div>
                    <Link
                      className="hub-primary"
                      href={`/anime/${item.anime_id}?episode=${item.episode}`}
                    >
                      <Play size={16} aria-hidden="true" />
                      Продолжить
                    </Link>
                  </article>
                ))}
              </section>
            ),
          )
        ) : (
          <Empty>
            {query
              ? 'По этому запросу серий не найдено.'
              : 'В истории пока нет серий.'}
          </Empty>
        ))}
      <More {...resource} />
    </>
  );
}
