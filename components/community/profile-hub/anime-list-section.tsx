'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Play, Star } from 'lucide-react';
import { statuses } from '@/lib/community';
import { api } from '../context';
import {
  Art,
  Empty,
  FilterTabs,
  More,
  Progress,
  ResourceState,
  SearchField,
  usePagedResource,
  type HubProfile,
  type ListItem,
} from './shared';
import { CustomLists } from './custom-lists';

export function AnimeListSection({
  profile,
  revision,
  onChanged,
}: {
  profile: HubProfile;
  revision: number;
  onChanged: () => Promise<void>;
}) {
  const [status, setStatus] = useState('watching');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('title');
  const [pending, setPending] = useState<number | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), 200);
    return () => clearTimeout(timer);
  }, [search]);
  const resource = usePagedResource<ListItem>(
    `/api/profile-hub?kind=list&status=${encodeURIComponent(status)}&q=${encodeURIComponent(query)}&sort=${sort}`,
    revision,
  );
  const [counts, setCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    const data = resource.data as typeof resource.data & {
      counts: Array<{ status: string; count: number }>;
    };
    if (data?.counts)
      setCounts(
        Object.fromEntries(
          data.counts.map((item) => [item.status, Number(item.count)]),
        ),
      );
  }, [resource.data]);
  async function change(
    action: string,
    values: Record<string, unknown>,
    id: number,
  ) {
    if (pending !== null) return;
    setPending(id);
    setError('');
    try {
      await api(action, values);
      await onChanged();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setPending(null);
    }
  }
  const options: Array<[string, string]> = [
    [
      'all',
      `Все · ${Object.values(counts).reduce((sum, count) => sum + count, 0)}`,
    ],
    ...Object.entries(statuses).map(([id, label]): [string, string] => [
      id,
      `${label} · ${counts[id] || 0}`,
    ]),
    ...profile.lists.map((list): [string, string] => [
      `list:${list.id}`,
      `${list.name} · ${list.item_count}`,
    ]),
  ];
  return (
    <>
      <FilterTabs
        options={options}
        value={status}
        onChange={setStatus}
        label="Категории списка"
      />
      <div className="hub-filters">
        <SearchField
          value={search}
          onChange={setSearch}
          label="Поиск по моему списку"
        />
        <select
          value={sort}
          onChange={(event) => setSort(event.target.value)}
          aria-label="Сортировка списка"
        >
          <option value="title">По названию</option>
          <option value="rating">По оценке</option>
          <option value="progress">По просмотренным сериям</option>
        </select>
      </div>
      {error && (
        <p className="hub-error" role="alert">
          {error}
        </p>
      )}
      <ResourceState {...resource} />
      {!resource.loading &&
        !resource.error &&
        (resource.items.length ? (
          <div className="hub-anime-grid">
            {resource.items.map((item) => (
              <article className="hub-anime-card" key={item.anime_id}>
                <Link className="hub-poster" href={`/anime/${item.anime_id}`}>
                  <Art src={item.image} alt={item.title} />
                </Link>
                <div>
                  <Link
                    href={`/anime/${item.anime_id}`}
                    className="hub-anime-title"
                  >
                    {item.title}
                  </Link>
                  <span>
                    {item.completed_episodes}
                    {item.total_episodes
                      ? ` / ${item.total_episodes}`
                      : ''}{' '}
                    серий просмотрено
                  </span>
                  {item.total_episodes && (
                    <Progress
                      value={item.completed_episodes}
                      total={item.total_episodes}
                      label={`Просмотрено серий ${item.title}`}
                    />
                  )}
                  <Link
                    className="hub-primary"
                    href={`/anime/${item.anime_id}${item.latest ? `?episode=${item.latest.episode}` : ''}`}
                  >
                    <Play size={16} aria-hidden="true" />
                    {item.latest ? 'Продолжить' : 'Смотреть'}
                  </Link>
                  <div className="hub-card-actions">
                    <select
                      value={item.status}
                      disabled={pending !== null}
                      aria-label={`Статус: ${item.title}`}
                      onChange={(event) =>
                        void change(
                          'collection',
                          { ...item, status: event.target.value },
                          item.anime_id,
                        )
                      }
                    >
                      {Object.entries(statuses).map(([id, label]) => (
                        <option key={id} value={id}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <details className="hub-entry-details">
                    <summary>Управление</summary>
                    <label>
                      Оценка
                      <select
                        value={item.rating}
                        disabled={pending !== null}
                        onChange={(event) =>
                          void change(
                            'collection',
                            { ...item, rating: Number(event.target.value) },
                            item.anime_id,
                          )
                        }
                      >
                        <option value={0}>Без оценки</option>
                        {Array.from({ length: 10 }, (_, index) => (
                          <option key={index} value={index + 1}>
                            {index + 1} / 10
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="hub-button"
                      disabled={pending !== null}
                      aria-pressed={!!item.favorite}
                      onClick={() =>
                        void change(
                          'collection',
                          { ...item, favorite: !item.favorite },
                          item.anime_id,
                        )
                      }
                    >
                      <Star
                        size={16}
                        fill={item.favorite ? 'currentColor' : 'none'}
                      />
                      {item.favorite ? 'Убрать из любимых' : 'В любимые'}
                    </button>
                    {profile.lists.map((list) => (
                      <label className="hub-check" key={list.id}>
                        <input
                          type="checkbox"
                          checked={item.list_ids.includes(list.id)}
                          disabled={pending !== null}
                          onChange={(event) =>
                            void change(
                              'list_membership',
                              {
                                list_id: list.id,
                                anime_id: item.anime_id,
                                value: event.target.checked,
                              },
                              item.anime_id,
                            )
                          }
                        />
                        {list.name}
                      </label>
                    ))}
                    <button
                      className="hub-button"
                      disabled={pending !== null}
                      onClick={() =>
                        void change(
                          'collection',
                          { anime_id: item.anime_id, remove: true },
                          item.anime_id,
                        )
                      }
                    >
                      Убрать из списка
                    </button>
                  </details>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <Empty>
            В этой категории пока нет аниме.{' '}
            <Link href="/catalog">Открыть каталог</Link>
          </Empty>
        ))}
      <More {...resource} />
      <CustomLists profile={profile} onChanged={onChanged} />
    </>
  );
}
