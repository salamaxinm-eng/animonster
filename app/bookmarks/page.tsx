'use client';

import { useEffect, useMemo, useState } from 'react';
import { Heart, History, ListVideo } from 'lucide-react';
import {
  api,
  CommunityHeader,
  useCommunity,
} from '@/components/community/context';
import type { CollectionList, Entry } from '@/lib/community';
import { proxyImageUrl } from '@/lib/anime';

type BookmarkTab = 'later' | 'lists' | 'history';
type HistoryEntry = {
  anime_id: number;
  episode: number;
  position: number;
  completed_episodes: number;
  anime?: { russian: string; image?: { original?: string } };
};

export default function BookmarksPage() {
  const community = useCommunity();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [lists, setLists] = useState<CollectionList[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [tab, setTab] = useState<BookmarkTab>('later');
  const [listId, setListId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    if (!community.user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [profile, stats] = await Promise.all([
        api('profile'),
        fetch('/api/stats').then(async (response) => {
          const result = await response.json();
          if (!response.ok)
            throw Error(result.error || 'Не удалось загрузить историю');
          return result;
        }),
      ]);
      setEntries(profile.entries);
      setLists(profile.lists);
      setHistory(stats.history || []);
      setListId((current) => current || profile.lists[0]?.id || '');
      setError('');
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [community.user?.id]);

  const shown = useMemo(
    () =>
      tab === 'lists' && listId
        ? entries.filter((entry) => entry.list_ids.includes(listId))
        : entries.filter(
            (entry) => entry.status === 'planned' || entry.favorite,
          ),
    [entries, listId, tab],
  );

  return (
    <div className="social-site bookmarks-page">
      <CommunityHeader />
      <main className="title-page">
        <nav className="bookmarks-tabs" aria-label="Разделы закладок">
          <button
            className={tab === 'later' ? 'active' : ''}
            onClick={() => setTab('later')}
          >
            Смотреть позже
          </button>
          <button
            className={tab === 'lists' ? 'active' : ''}
            onClick={() => setTab('lists')}
          >
            Мои списки
          </button>
          <button
            className={tab === 'history' ? 'active' : ''}
            onClick={() => setTab('history')}
          >
            История
          </button>
        </nav>
        {!community.loaded || loading ? (
          <p role="status">Загружаем закладки…</p>
        ) : !community.user ? (
          <section className="bookmarks-empty">
            <Heart />
            <h2>Сохраняй аниме</h2>
            <p>
              Войди в аккаунт, чтобы закладки и история были доступны на всех
              устройствах.
            </p>
            <button className="primary" onClick={community.login}>
              Войти в аккаунт
            </button>
          </section>
        ) : error ? (
          <p className="error-msg" role="alert">
            {error}
          </p>
        ) : tab === 'history' ? (
          <section className="bookmark-list">
            <h2>Недавнее</h2>
            {history.length ? (
              history.map((entry) => (
                <a
                  className="bookmark-row"
                  href={`/anime/${entry.anime_id}?episode=${entry.episode}`}
                  key={entry.anime_id}
                >
                  {entry.anime?.image?.original ? (
                    <span className="bookmark-history-poster">
                      <img
                        src={proxyImageUrl(entry.anime.image.original)}
                        alt=""
                      />
                    </span>
                  ) : (
                    <div className="bookmark-placeholder">
                      <History />
                    </div>
                  )}
                  <div>
                    <strong>
                      {entry.anime?.russian || `Аниме #${entry.anime_id}`}
                    </strong>
                    <span>Продолжить с серии {entry.episode}</span>
                    <small>Просмотрено серий: {entry.completed_episodes}</small>
                  </div>
                </a>
              ))
            ) : (
              <Empty message="История появится после начала просмотра." />
            )}
          </section>
        ) : (
          <section className="bookmark-list">
            <div className="bookmark-list-heading">
              <h2>{tab === 'lists' ? 'Мои списки' : 'Недавнее'}</h2>
              {tab === 'lists' && (
                <a href="/profile?tab=collection">Управлять</a>
              )}
            </div>
            {tab === 'lists' && lists.length > 0 && (
              <nav className="bookmark-list-pills">
                {lists.map((list) => (
                  <button
                    className={list.id === listId ? 'active' : ''}
                    onClick={() => setListId(list.id)}
                    key={list.id}
                  >
                    {list.name} <span>{list.item_count}</span>
                  </button>
                ))}
              </nav>
            )}
            {shown.length ? (
              shown.map((entry) => (
                <article className="bookmark-row" key={entry.anime_id}>
                  <a href={`/anime/${entry.anime_id}`}>
                    <img src={proxyImageUrl(entry.image)} alt={entry.title} />
                  </a>
                  <div>
                    <a href={`/anime/${entry.anime_id}`}>
                      <strong>{entry.title}</strong>
                    </a>
                    <span>
                      {entry.status === 'watching'
                        ? 'Смотрю'
                        : 'Смотреть позже'}
                    </span>
                    <small>
                      {entry.favorite ? 'В избранном' : 'В коллекции'}
                    </small>
                  </div>
                  <button
                    className={entry.favorite ? 'saved' : ''}
                    aria-label="Убрать из избранного"
                    onClick={async () => {
                      await api('favorite', {
                        anime_id: entry.anime_id,
                        value: false,
                      });
                      await load();
                    }}
                  >
                    <Heart fill={entry.favorite ? 'currentColor' : 'none'} />
                  </button>
                </article>
              ))
            ) : (
              <Empty
                message={
                  tab === 'lists' && !lists.length
                    ? 'Создай свой первый список в профиле.'
                    : 'Здесь пока нет сохранённых аниме.'
                }
              />
            )}
          </section>
        )}
      </main>
    </div>
  );
}

function Empty({ message }: { message: string }) {
  return (
    <div className="bookmarks-empty">
      <ListVideo />
      <p>{message}</p>
      <a className="primary" href="/catalog">
        Открыть каталог
      </a>
    </div>
  );
}
