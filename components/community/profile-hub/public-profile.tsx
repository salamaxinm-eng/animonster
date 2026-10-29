'use client';
import { FeedbackMessage } from '@/components/feedback-message';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Shield } from 'lucide-react';
import { statuses, type Entry } from '@/lib/community';
import { api, CommunityHeader, useCommunity } from '../context';
import { Comments } from '../comments';
import { ProfileIdentity } from './profile-identity';
import {
  Art,
  Empty,
  FilterTabs,
  More,
  Progress,
  ResourceState,
  SearchField,
  usePagedResource,
  useResource,
  type HubProfile,
} from './shared';

type Stats = {
  xp: number;
  level: number;
  seconds: number;
  achievements: Array<{
    id: string;
    title: string;
    current: number;
    target: number;
    unlocked: boolean;
  }>;
};
export function PublicProfile({ id }: { id: string }) {
  const community = useCommunity();
  const profile = useResource<HubProfile & { blocked: boolean }>(
    `/api/community?action=profile&view=hub&id=${encodeURIComponent(id)}`,
  );
  const stats = useResource<Stats>(
    `/api/stats?summary=1&id=${encodeURIComponent(id)}`,
  );
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), 200);
    return () => clearTimeout(timer);
  }, [search]);
  const user = profile.data?.user;
  return (
    <div className={`site-shell profile-hub theme-${user?.theme || 'eclipse'}`}>
      <CommunityHeader />
      <main className="hub-public-main">
        <Link className="hub-button" href="/catalog">
          <ArrowLeft size={18} />
          Каталог
        </Link>
        <ResourceState {...profile} />
        {profile.data && (
          <>
            <div className="hub-section-title">
              <h2>Публичный профиль</h2>
              {profile.data.own ? (
                <Link className="hub-button" href="/profile">
                  Мой кабинет
                </Link>
              ) : (
                community.user && (
                  <button
                    className="hub-button"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      setError('');
                      try {
                        await api('block', {
                          id,
                          value: !profile.data!.blocked,
                        });
                        profile.retry();
                      } catch (cause) {
                        setError((cause as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <Shield size={16} />
                    {profile.data.blocked ? 'Разблокировать' : 'Заблокировать'}
                  </button>
                )
              )}
            </div>
            <ProfileIdentity user={profile.data.user} />
            {error && (
              <p className="hub-error" role="alert">
                <FeedbackMessage>{error}</FeedbackMessage>
              </p>
            )}
            <ResourceState {...stats} />
            {stats.data && (
              <>
                <div className="hub-stats">
                  <span>
                    <strong>{stats.data.level}</strong>Уровень
                  </span>
                  <span>
                    <strong>{stats.data.xp}</strong>Серий просмотрено
                  </span>
                  <span>
                    <strong>{(stats.data.seconds / 3600).toFixed(1)}</strong>
                    Часов аниме
                  </span>
                </div>
                <details className="hub-showcase-editor">
                  <summary>
                    Прогресс зрителя ·{' '}
                    {
                      stats.data.achievements.filter((item) => item.unlocked)
                        .length
                    }{' '}
                    / {stats.data.achievements.length}
                  </summary>
                  <div className="hub-achievement-grid">
                    {stats.data.achievements.map((item) => (
                      <article
                        className={`hub-achievement ${item.unlocked ? 'earned' : ''}`}
                        key={item.id}
                      >
                        <div>
                          <strong>{item.title}</strong>
                          <p>
                            {item.unlocked
                              ? 'Получено'
                              : `${Math.min(item.current, item.target)} / ${item.target}`}
                          </p>
                          <Progress
                            value={item.current}
                            total={item.target}
                            label={item.title}
                          />
                        </div>
                      </article>
                    ))}
                  </div>
                </details>
              </>
            )}
            {profile.data.passport_public && (
              <Link
                className="hub-button hub-support-link"
                href={`/members/${id}/passport`}
              >
                Аниме-паспорт →
              </Link>
            )}
            {(!!profile.data.anime_showcase.length ||
              !!profile.data.character_showcase.length) && (
              <>
                <div className="hub-section-title">
                  <h2>Витрина Plus</h2>
                </div>
                <div className="hub-showcase">
                  {profile.data.anime_showcase.map((item) => (
                    <Link key={item.anime_id} href={`/anime/${item.anime_id}`}>
                      <Art src={item.anime?.image.original} />
                      <span>
                        {item.anime?.russian ||
                          item.anime?.name ||
                          `Аниме #${item.anime_id}`}
                      </span>
                    </Link>
                  ))}
                  {profile.data.character_showcase.map((item) => (
                    <article key={item.id}>
                      <Art src={item.image} />
                      <span>{item.name}</span>
                    </article>
                  ))}
                </div>
              </>
            )}
            <section className="hub-public-tabs">
              <h2>Список аниме</h2>
              {profile.data.own || profile.data.user.collection_public ? (
                <>
                  {profile.data.lists
                    .filter((list) => status === `list:${list.id}`)
                    .map((list) => (
                      <section className="hub-custom-list" key={list.id}>
                        {list.cover && (
                          <Art
                            src={
                              list.cover.startsWith('asset:')
                                ? `/api/plus-assets/${list.cover.split(':')[1]}`
                                : list.cover
                            }
                          />
                        )}
                        <strong>{list.name}</strong>
                        {list.description && <p>{list.description}</p>}
                      </section>
                    ))}
                  <FilterTabs
                    value={status}
                    onChange={setStatus}
                    label="Категории публичного списка"
                    options={[
                      ['all', 'Все'],
                      ['favorites', 'Любимые'],
                      ...Object.entries(statuses),
                      ...profile.data.lists.map((list): [string, string] => [
                        `list:${list.id}`,
                        `${list.name} · ${list.item_count}`,
                      ]),
                    ]}
                  />
                  <div className="hub-filters">
                    <SearchField
                      value={search}
                      onChange={setSearch}
                      label="Поиск в списке пользователя"
                    />
                  </div>
                  <PublicList id={id} status={status} query={query} />
                </>
              ) : (
                <Empty>Пользователь скрыл свой список аниме.</Empty>
              )}
            </section>
            <section className="hub-wall">
              <h2>Стенка</h2>
              <Comments
                scope={`wall:${id}`}
                closed={!profile.data.user.wall_open || profile.data.blocked}
              />
            </section>
          </>
        )}
      </main>
    </div>
  );
}
function PublicList({
  id,
  status,
  query,
}: {
  id: string;
  status: string;
  query: string;
}) {
  const resource = usePagedResource<Entry>(
    `/api/community?action=profile_list&id=${encodeURIComponent(id)}&status=${encodeURIComponent(status)}&q=${encodeURIComponent(query)}`,
  );
  return (
    <>
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
                    className="hub-anime-title"
                    href={`/anime/${item.anime_id}`}
                  >
                    {item.title}
                  </Link>
                  <span>
                    {statuses[item.status as keyof typeof statuses] ||
                      item.status}
                    {item.rating ? ` · ${item.rating} / 10` : ''}
                    {item.favorite ? ' · Любимое' : ''}
                  </span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <Empty>В этой категории нет аниме.</Empty>
        ))}
      <More {...resource} />
    </>
  );
}
