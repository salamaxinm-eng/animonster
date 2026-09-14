'use client';
import { ProfileJourney } from './profile-journey';
import { BuySubscription } from './buy-subscription';
import { AccountData } from './account-data';
import { TelegramSettings } from './telegram-settings';

import { useEffect, useState } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { NativeSelect } from '@/components/ui/native-select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Settings,
  Star,
  Gem,
  Bookmark,
  Check,
  Shield,
  Bell,
  ImagePlus,
} from 'lucide-react';
import { api, useCommunity, CommunityHeader, Avatar, Pin } from './context';
import { Comments } from './comments';
import {
  themes,
  avatars,
  pins,
  statuses,
  type Profile,
  type Entry,
  type CollectionList,
} from '@/lib/community';
import { proxyImageUrl } from '@/lib/anime';
export function ProfilePage({
  id,
  initialTab = 'wall',
}: {
  id?: string;
  initialTab?: string;
}) {
  const c = useCommunity(),
    [data, setData] = useState<{
      user: Profile;
      entries: Entry[];
      lists: CollectionList[];
      anime_showcase: Array<{ anime_id: number; anime: any }>;
      character_showcase: Array<{ id: string; name: string; image: string }>;
      characters: Array<{ id: string; name: string; image: string }>;
      own: boolean;
      blocked: boolean;
    } | null>(null),
    [draft, setDraft] = useState<Profile | null>(null),
    [tab, setTab] = useState(initialTab),
    [status, setStatus] = useState('all'),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [creatingList, setCreatingList] = useState(false),
    [newListName, setNewListName] = useState(''),
    [showcaseAnime, setShowcaseAnime] = useState(''),
    [showcaseCharacters, setShowcaseCharacters] = useState<string[]>([]),
    [avatarBusy, setAvatarBusy] = useState(false),
    [notifications, setNotifications] = useState<
      Array<{
        id: string;
        nick: string;
        scope: string;
        seen: number;
        comment_id: string;
      }>
    >([]),
    [blocks, setBlocks] = useState<Array<{ id: string; nick: string }>>([]),
    [reports, setReports] = useState<
      Array<{ id: string; body: string; reason: string }>
    >([]);
  async function load() {
    try {
      const x = await api(
        'profile' + (id ? '&id=' + encodeURIComponent(id) : ''),
      );
      setData(x);
      setDraft(x.user);
      setShowcaseAnime(
        (x.anime_showcase || []).map((item: any) => item.anime_id).join(', '),
      );
      setShowcaseCharacters(
        (x.character_showcase || []).map((item: any) => item.id),
      );
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    if (id || c.user) void load();
  }, [id, c.user?.id]);
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    if (q.get('tab') === 'notifications') setTab('notifications');
    if (q.get('tab') === 'moderation') setTab('moderation');
    if (q.get('tab') === 'collection') setTab('collection');
    if (q.get('tab') === 'settings') setTab('settings');
    if (q.get('auth') === 'failed')
      setError('Вход через VK не завершился. Попробуйте ещё раз.');
    if (q.get('payment') === 'return')
      void fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'check' }),
      })
        .then(async (response) => {
          const result = await response.json();
          if (!response.ok) throw new Error(result.error);
          if (result.status === 'succeeded') {
            setNotice('AniMonster Plus активирован на 30 дней');
            await c.refresh();
            await load();
          } else if (result.status === 'canceled')
            setError('Оплата отменена. Plus не был активирован.');
          else
            setNotice(
              'Платёж ещё обрабатывается. Статус обновится после подтверждения.',
            );
          history.replaceState(null, '', '/profile');
        })
        .catch((paymentError) =>
          setError(paymentError.message || 'Не удалось проверить платёж'),
        );
  }, []);
  useEffect(() => {
    if (tab === 'notifications' && c.user)
      api('notifications')
        .then(setNotifications)
        .catch((e) => setError(e.message));
    if (tab === 'settings' && c.user)
      api('blocks')
        .then(setBlocks)
        .catch((e) => setError(e.message));
    if (tab === 'moderation' && c.moderator)
      api('reports')
        .then(setReports)
        .catch((e) => setError(e.message));
  }, [tab, c.user, c.moderator]);
  useEffect(() => {
    if (tab !== 'settings' || !data) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById('profile-settings')?.scrollIntoView({
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'instant'
          : 'smooth',
        block: 'start',
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [tab, !!data]);
  async function act(action: string, values: Record<string, unknown>) {
    setBusy(true);
    setNotice('');
    try {
      await api(action, values);
      await load();
      if (action === 'profile') await c.refresh();
      setNotice('Сохранено');
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function uploadAvatar(file?: File) {
    if (!file) return;
    setAvatarBusy(true);
    setNotice('');
    setError('');
    try {
      const form = new FormData();
      form.set('avatar', file);
      const response = await fetch('/api/avatar', {
        method: 'POST',
        body: form,
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || 'Не удалось загрузить аватар');
      setDraft((current) =>
        current ? { ...current, avatar: result.avatar } : current,
      );
      setData((current) =>
        current
          ? { ...current, user: { ...current.user, avatar: result.avatar } }
          : current,
      );
      await c.refresh();
      setNotice('Аватар обновлён');
    } catch (uploadError) {
      setError((uploadError as Error).message);
    } finally {
      setAvatarBusy(false);
    }
  }
  async function uploadPlusAsset(
    kind: 'profile_background' | 'list_cover',
    file?: File,
    listId?: string,
  ) {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.set('image', file);
      form.set('kind', kind);
      if (listId) form.set('list_id', listId);
      const response = await fetch('/api/plus-assets', {
        method: 'POST',
        body: form,
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || 'Не удалось загрузить изображение');
      await load();
      await c.refresh();
      setNotice('Оформление обновлено');
    } catch (assetError) {
      setError((assetError as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function createList() {
    if (!newListName.trim()) return;
    setBusy(true);
    setError('');
    try {
      await api('list_create', { name: newListName });
      setNewListName('');
      setCreatingList(false);
      await load();
      setNotice('Список создан');
    } catch (listError) {
      setError((listError as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const shown =
      data?.entries.filter(
        (e) =>
          status === 'all' ||
          status === e.status ||
          (status.startsWith('list:') && e.list_ids.includes(status.slice(5))),
      ) || [],
    theme =
      themes.find(
        (t) => t.id === (tab === 'settings' ? draft?.theme : data?.user.theme),
      ) || themes[0];
  return (
    <div
      className={`social-site account-page ${tab === 'settings' && data?.own ? 'account-editing' : ''}`}
      style={{ '--profile-accent': theme.color } as React.CSSProperties}
    >
      <CommunityHeader />
      {c.preview && (
        <div className="preview-note">
          Предпросмотр владельца · профиль сохраняется на сервере · вход через
          VK и оплата ещё настраиваются
        </div>
      )}
      {!data ? (
        <div className="profile-loading">
          <h1>
            {!id && !c.user
              ? 'Твой профиль начинается здесь'
              : 'Профиль AniMonster'}
          </h1>
          <p>
            {error ||
              (!c.loaded
                ? 'Загрузка…'
                : !id && !c.user
                  ? 'Войди в аккаунт, чтобы собрать свою коллекцию и познакомиться с другими зрителями.'
                  : 'Загрузка профиля…')}
          </p>
          {!id && !c.user && (
            <button className="vk-button" onClick={c.login}>
              Войти в аккаунт
            </button>
          )}
        </div>
      ) : (
        <>
          <div className={'profile-cover theme-' + theme.id}>
            <img
              src={
                data.user.profile_background?.startsWith('asset:')
                  ? `/api/plus-assets/${data.user.profile_background.split(':')[1]}`
                  : '/hero.png'
              }
              alt="Обложка профиля"
            />
            <div />
            <span>ANIMONSTER COMMUNITY</span>
          </div>
          <section
            className={`profile-identity profile-frame-${data.user.profile_frame || 'none'}`}
          >
            <Avatar
              large
              avatar={tab === 'settings' ? draft?.avatar : data.user.avatar}
              theme={theme.id}
            />
            <div className="profile-name">
              <div className="profile-title-row">
                <h1>{tab === 'settings' ? draft?.nick : data.user.nick}</h1>
                <Pin
                  id={tab === 'settings' ? draft?.pin || null : data.user.pin}
                />
              </div>
              <p>
                {data.user.created_at &&
                Number.isFinite(new Date(data.user.created_at).getTime())
                  ? `На AniMonster с ${new Date(data.user.created_at).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}`
                  : 'Участник AniMonster'}
                {!!data.user.premium_until && (
                  <span className="plus-label"> PLUS</span>
                )}
              </p>
            </div>
            {data.own ? (
              <button
                className="outline-button"
                onClick={() => {
                  setTab('settings');
                  history.replaceState(
                    null,
                    '',
                    '/profile?tab=settings#profile-settings',
                  );
                  requestAnimationFrame(() =>
                    document
                      .getElementById('profile-settings')
                      ?.scrollIntoView({
                        behavior: matchMedia('(prefers-reduced-motion: reduce)')
                          .matches
                          ? 'instant'
                          : 'smooth',
                        block: 'start',
                      }),
                  );
                }}
              >
                <Settings size={16} /> Редактировать профиль
              </button>
            ) : (
              c.user && (
                <button
                  className="outline-button"
                  onClick={() =>
                    act('block', { id: data.user.id, value: !data.blocked })
                  }
                >
                  {data.blocked ? 'Разблокировать' : 'Заблокировать'}
                </button>
              )
            )}
          </section>
          <div className="account-journey">
            <ProfileJourney
              id={data.user.id}
              revision={
                data.user.collection_public +
                data.entries.filter((e) => e.favorite).length * 10
              }
            />
          </div>
          <div className="profile-layout">
            <aside className="profile-sidebar">
              <section className="social-panel">
                <p className="muted">
                  Подписка:{' '}
                  {data.user.premium_until
                    ? `Plus до ${new Date(
                        data.user.premium_until,
                      ).toLocaleString('ru-RU', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}`
                    : 'Бесплатная'}
                </p>
                {data.own && <BuySubscription />}
                <h3>О себе</h3>
                <p>
                  {data.user.bio ||
                    'Здесь скоро появится история этого зрителя.'}
                </p>
                <a className="profile-link" href={'/members/' + data.user.id}>
                  Постоянная ссылка на профиль ↗
                </a>
              </section>
              <section className="social-panel">
                <h3>Моя коллекция</h3>
                <div className="profile-stats">
                  {Object.entries(statuses).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => {
                        setTab('collection');
                        setStatus(key);
                      }}
                    >
                      <strong>
                        {data.entries.filter((e) => e.status === key).length}
                      </strong>
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
                {!!data.lists.length && (
                  <div className="custom-list-nav">
                    {data.lists.map((list) => (
                      <div key={list.id}>
                        <button
                          onClick={() => {
                            setTab('collection');
                            setStatus('list:' + list.id);
                          }}
                        >
                          {list.cover?.startsWith('asset:') && (
                            <img
                              className="custom-list-cover"
                              src={`/api/plus-assets/${list.cover.split(':')[1]}`}
                              alt=""
                            />
                          )}
                          <span>{list.name}</span>
                          {!!list.pinned && <span title="Закреплено">★</span>}
                          <strong>{list.item_count}</strong>
                        </button>
                        {!!list.description && (
                          <p className="custom-list-description">
                            {list.description}
                          </p>
                        )}
                        {data.own && (
                          <button
                            className="list-delete"
                            aria-label={'Удалить список ' + list.name}
                            onClick={() => {
                              if (confirm(`Удалить список «${list.name}»?`)) {
                                if (status === 'list:' + list.id)
                                  setStatus('all');
                                void act('list_delete', { id: list.id });
                              }
                            }}
                          >
                            ×
                          </button>
                        )}
                        {data.own && !!data.user.premium_until && (
                          <details className="list-plus-editor">
                            <summary>Оформить</summary>
                            <textarea
                              defaultValue={list.description}
                              maxLength={300}
                              placeholder="Описание списка"
                              onBlur={(event) =>
                                void act('list_update', {
                                  id: list.id,
                                  description: event.target.value,
                                  pinned: !!list.pinned,
                                })
                              }
                            />
                            <label>
                              <Checkbox
                                checked={!!list.pinned}
                                onCheckedChange={(value) =>
                                  void act('list_update', {
                                    id: list.id,
                                    description: list.description,
                                    pinned: !!value,
                                  })
                                }
                              />{' '}
                              Закрепить в профиле
                            </label>
                            <label className="outline-button">
                              Обложка
                              <input
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                onChange={(event) => {
                                  void uploadPlusAsset(
                                    'list_cover',
                                    event.target.files?.[0],
                                    list.id,
                                  );
                                  event.target.value = '';
                                }}
                              />
                            </label>
                          </details>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {data.own &&
                  (creatingList ? (
                    <form
                      className="create-list-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void createList();
                      }}
                    >
                      <input
                        aria-label="Название нового списка"
                        value={newListName}
                        minLength={2}
                        maxLength={30}
                        placeholder="Название списка"
                        onChange={(event) => setNewListName(event.target.value)}
                      />
                      <button disabled={busy}>Создать</button>
                      <button
                        type="button"
                        onClick={() => {
                          setCreatingList(false);
                          setNewListName('');
                        }}
                      >
                        Отмена
                      </button>
                    </form>
                  ) : (
                    <button
                      className="create-list-button"
                      onClick={() => setCreatingList(true)}
                    >
                      + Создать свой список
                    </button>
                  ))}
                {!data.user.collection_public && !data.own && (
                  <p className="muted">Коллекция скрыта владельцем.</p>
                )}
              </section>
              <a className="plus-promo" href="/pins">
                <Gem size={24} />
                <h3>Твой ник. Твой тайтл.</h3>
                <p>Коллекционные пины рядом с ником</p>
                <strong>
                  89 ₽ <span>/ 30 дней</span>
                </strong>
                <span className="plus-promo-link">
                  Открыть AniMonster Plus →
                </span>
              </a>
            </aside>
            <div className="profile-main">
              {!!data.user.premium_until &&
                (!!data.anime_showcase.length ||
                  !!data.character_showcase.length) && (
                  <section className="social-panel plus-showcase">
                    <h2>Избранное Plus</h2>
                    <div className="plus-showcase-grid">
                      {data.anime_showcase.map((item) => (
                        <a
                          href={`/anime/${item.anime_id}`}
                          key={`anime-${item.anime_id}`}
                        >
                          {item.anime?.image?.original && (
                            <img
                              src={proxyImageUrl(item.anime.image.original)}
                              alt=""
                            />
                          )}
                          <strong>
                            {item.anime?.russian ||
                              item.anime?.name ||
                              `Аниме #${item.anime_id}`}
                          </strong>
                        </a>
                      ))}
                      {data.character_showcase.map((item) => (
                        <article key={`character-${item.id}`}>
                          <img src={item.image} alt="" />
                          <strong>{item.name}</strong>
                        </article>
                      ))}
                    </div>
                  </section>
                )}
              <Tabs
                value={tab}
                onValueChange={(v) => {
                  setTab(String(v));
                  setNotice('');
                }}
              >
                <TabsList className="social-tabs">
                  <TabsTrigger value="wall">Стенка</TabsTrigger>
                  <TabsTrigger value="collection">Коллекция</TabsTrigger>
                  {data.own && (
                    <>
                      <TabsTrigger value="settings">
                        <Settings size={15} /> Настройки
                      </TabsTrigger>
                      <TabsTrigger value="notifications">
                        <Bell size={15} /> Уведомления
                      </TabsTrigger>
                      {c.moderator && (
                        <TabsTrigger value="moderation">
                          <Shield size={15} />
                        </TabsTrigger>
                      )}
                    </>
                  )}
                </TabsList>
              </Tabs>
              {error && (
                <p className="error-msg" role="alert">
                  {error}
                </p>
              )}
              {notice && (
                <p className="success-msg" role="status">
                  {notice}
                </p>
              )}
              {tab === 'wall' && (
                <>
                  <section className="social-panel favorites-panel">
                    <div className="panel-title">
                      <h3>
                        <Star size={17} /> Любимые истории
                      </h3>
                      <span>
                        {data.entries.filter((e) => e.favorite).length}/5
                      </span>
                    </div>
                    {data.entries.some((e) => e.favorite) ? (
                      <div className="favorite-posters">
                        {data.entries
                          .filter((e) => e.favorite)
                          .map((e) => (
                            <a href={'/?anime=' + e.anime_id} key={e.anime_id}>
                              <img src={proxyImageUrl(e.image)} alt={e.title} />
                              <span>{e.title}</span>
                            </a>
                          ))}
                      </div>
                    ) : (
                      <p className="muted">
                        {data.own
                          ? 'Выбери до пяти любимых тайтлов в коллекции — они появятся здесь.'
                          : 'Любимые тайтлы пока не выбраны.'}
                      </p>
                    )}
                  </section>
                  <Comments
                    scope={'wall:' + data.user.id}
                    closed={!data.user.wall_open || data.blocked}
                  />
                </>
              )}
              {tab === 'collection' && (
                <section className="social-panel">
                  <div className="panel-title">
                    <h3>Коллекция аниме</h3>
                    <NativeSelect
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                      aria-label="Фильтр коллекции"
                    >
                      <option value="all">Все статусы</option>
                      {Object.entries(statuses).map(([v, t]) => (
                        <option value={v} key={v}>
                          {t}
                        </option>
                      ))}
                      {data.lists.map((list) => (
                        <option key={list.id} value={'list:' + list.id}>
                          {list.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                  {!shown.length ? (
                    <div className="social-empty">
                      <Bookmark size={28} />
                      <p>Здесь пока нет аниме.</p>
                      <a href="/#catalog" className="primary">
                        Выбрать в каталоге
                      </a>
                    </div>
                  ) : (
                    shown.map((e) => (
                      <div className="collection-entry" key={e.anime_id}>
                        <a href={'/?anime=' + e.anime_id}>
                          <img src={proxyImageUrl(e.image)} alt={e.title} />
                        </a>
                        <div className="collection-entry-info">
                          <a href={'/?anime=' + e.anime_id}>{e.title}</a>
                          {data.own ? (
                            <div className="entry-controls">
                              <NativeSelect
                                aria-label={'Статус ' + e.title}
                                value={e.status}
                                disabled={busy}
                                onChange={(x) =>
                                  act('collection', {
                                    ...e,
                                    status: x.target.value,
                                  })
                                }
                              >
                                {Object.entries(statuses).map(([v, t]) => (
                                  <option key={v} value={v}>
                                    {t}
                                  </option>
                                ))}
                              </NativeSelect>
                              <NativeSelect
                                aria-label={'Оценка ' + e.title}
                                value={e.rating}
                                disabled={busy}
                                onChange={(x) =>
                                  act('collection', {
                                    ...e,
                                    rating: Number(x.target.value),
                                  })
                                }
                              >
                                <option value={0}>Без оценки</option>
                                {Array.from({ length: 10 }, (_, i) => (
                                  <option key={i} value={i + 1}>
                                    ★ {i + 1}
                                  </option>
                                ))}
                              </NativeSelect>
                              <button
                                disabled={busy}
                                className={
                                  e.favorite
                                    ? 'favorite-toggle on'
                                    : 'favorite-toggle'
                                }
                                onClick={() =>
                                  act('collection', {
                                    ...e,
                                    favorite: !e.favorite,
                                  })
                                }
                                aria-label="В витрину любимых"
                              >
                                <Star
                                  size={18}
                                  fill={e.favorite ? 'currentColor' : 'none'}
                                />
                              </button>
                              <button
                                disabled={busy}
                                onClick={() =>
                                  act('collection', {
                                    anime_id: e.anime_id,
                                    remove: true,
                                  })
                                }
                              >
                                Убрать
                              </button>
                            </div>
                          ) : (
                            <p>
                              {statuses[e.status as keyof typeof statuses]}{' '}
                              {e.rating ? '· ★ ' + e.rating : ''}
                            </p>
                          )}
                          {data.own && !!data.lists.length && (
                            <details className="entry-custom-lists">
                              <summary>Свои списки</summary>
                              <div>
                                {data.lists.map((list) => (
                                  <label key={list.id}>
                                    <Checkbox
                                      checked={e.list_ids.includes(list.id)}
                                      disabled={busy}
                                      onCheckedChange={(value) =>
                                        void act('list_membership', {
                                          list_id: list.id,
                                          anime_id: e.anime_id,
                                          value: !!value,
                                        })
                                      }
                                    />
                                    {list.name}
                                  </label>
                                ))}
                              </div>
                            </details>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </section>
              )}
              {tab === 'settings' && data.own && draft && (
                <form
                  id="profile-settings"
                  className="social-panel profile-editor"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void act('profile', draft);
                  }}
                >
                  <div className="profile-editor-heading">
                    <div>
                      <h3>Настройки профиля</h3>
                      <p className="muted">Сделай эту страницу своей.</p>
                    </div>
                    <button
                      type="button"
                      className="outline-button"
                      onClick={() => {
                        setTab('wall');
                        history.replaceState(null, '', '/profile');
                        window.scrollTo({ top: 0, behavior: 'instant' });
                      }}
                    >
                      К профилю
                    </button>
                  </div>
                  <label>
                    Ник
                    <input
                      value={draft.nick}
                      minLength={3}
                      maxLength={24}
                      required
                      onChange={(e) =>
                        setDraft({ ...draft, nick: e.target.value })
                      }
                    />
                    <small>3–24 буквы, цифры, дефис или подчёркивание.</small>
                  </label>
                  <label>
                    О себе
                    <textarea
                      value={draft.bio}
                      maxLength={400}
                      placeholder="Любимые жанры, герои и немного о тебе"
                      onChange={(e) =>
                        setDraft({ ...draft, bio: e.target.value })
                      }
                    />
                  </label>
                  <fieldset>
                    <legend>Аватар</legend>
                    <div className="avatar-upload">
                      <Avatar large avatar={draft.avatar} theme={draft.theme} />
                      <div>
                        <label className="outline-button">
                          <ImagePlus size={17} />
                          {avatarBusy ? 'Загружаем…' : 'Загрузить свой аватар'}
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            disabled={
                              avatarBusy ||
                              !data.user.entitlements.can_change_avatar
                            }
                            onChange={(event) => {
                              void uploadAvatar(event.target.files?.[0]);
                              event.target.value = '';
                            }}
                          />
                        </label>
                        <small>
                          {data.user.entitlements.can_change_avatar
                            ? 'PNG, JPEG или WebP, до 2 МБ.'
                            : `Смена аватара откроется на 5 уровне. Сейчас уровень ${data.user.level}.`}
                        </small>
                      </div>
                    </div>
                    <div className="avatar-options">
                      {avatars.map((a) => (
                        <button
                          type="button"
                          className={draft.avatar === a.id ? 'selected' : ''}
                          key={a.id}
                          disabled={!data.user.entitlements.can_change_avatar}
                          onClick={() => setDraft({ ...draft, avatar: a.id })}
                        >
                          <Avatar avatar={a.id} theme={draft.theme} />
                          <span>{a.name}</span>
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  <fieldset>
                    <legend>Тема и рамка</legend>
                    <div className="theme-options">
                      {themes.map((t) => (
                        <button
                          type="button"
                          className={draft.theme === t.id ? 'selected' : ''}
                          style={{ '--swatch': t.color } as React.CSSProperties}
                          key={t.id}
                          onClick={() => setDraft({ ...draft, theme: t.id })}
                        >
                          <span />
                          {t.name}
                          {draft.theme === t.id && <Check size={14} />}
                        </button>
                      ))}
                    </div>
                    <NativeSelect
                      value={draft.profile_frame || 'none'}
                      disabled={!data.user.premium_until}
                      onChange={(e) =>
                        setDraft({ ...draft, profile_frame: e.target.value })
                      }
                    >
                      <option value="none">Без рамки</option>
                      <option value="lime">Лайм</option>
                      <option value="violet">Фиолетовая</option>
                      <option value="fire">Огненная</option>
                      <option value="ice">Ледяная</option>
                    </NativeSelect>
                  </fieldset>
                  <fieldset>
                    <legend>Фон профиля · Plus</legend>
                    <label className="outline-button">
                      <ImagePlus size={17} /> Загрузить фон
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        disabled={!data.user.premium_until || busy}
                        onChange={(event) => {
                          void uploadPlusAsset(
                            'profile_background',
                            event.target.files?.[0],
                          );
                          event.target.value = '';
                        }}
                      />
                    </label>
                  </fieldset>
                  <fieldset disabled={!data.user.premium_until}>
                    <legend>Расширенная витрина · Plus</legend>
                    <label>
                      До пяти ID аниме через запятую
                      <input
                        value={showcaseAnime}
                        placeholder="38659, 40028"
                        onChange={(event) =>
                          setShowcaseAnime(event.target.value)
                        }
                      />
                    </label>
                    {!!data.characters.length && (
                      <div className="showcase-character-options">
                        {data.characters.map((character) => (
                          <label key={character.id}>
                            <Checkbox
                              checked={showcaseCharacters.includes(
                                character.id,
                              )}
                              disabled={
                                !showcaseCharacters.includes(character.id) &&
                                showcaseCharacters.length >= 5
                              }
                              onCheckedChange={(value) =>
                                setShowcaseCharacters((current) =>
                                  value
                                    ? [...current, character.id].slice(0, 5)
                                    : current.filter(
                                        (id) => id !== character.id,
                                      ),
                                )
                              }
                            />{' '}
                            {character.name}
                          </label>
                        ))}
                      </div>
                    )}
                    <button
                      className="outline-button"
                      type="button"
                      onClick={() =>
                        void act('showcase', {
                          anime_ids: showcaseAnime
                            .split(',')
                            .map((id) => Number(id.trim()))
                            .filter(Boolean),
                          character_ids: showcaseCharacters,
                        })
                      }
                    >
                      Сохранить витрину
                    </button>
                  </fieldset>
                  <label>
                    Пин справа от ника{' '}
                    {data.user.premium_until ? '' : '· нужен Plus'}
                    <NativeSelect
                      value={draft.pin || ''}
                      disabled={!data.user.premium_until}
                      onChange={(e) =>
                        setDraft({ ...draft, pin: e.target.value || null })
                      }
                    >
                      <option value="">Без пина</option>
                      {pins.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </label>
                  <a className="text-link" href="/pins">
                    Примерить коллекцию пинов →
                  </a>
                  <div className="privacy-settings">
                    <h3>Настройки просмотра</h3>
                    <label>
                      <Checkbox
                        checked={!!draft.auto_skip_segments}
                        onCheckedChange={(v) =>
                          setDraft({ ...draft, auto_skip_segments: !!v })
                        }
                      />{' '}
                      Автоматически пропускать опенинги и эндинги
                    </label>
                    <h3>Приватность</h3>
                    <label>
                      <Checkbox
                        checked={!!draft.wall_open}
                        onCheckedChange={(v) =>
                          setDraft({ ...draft, wall_open: v ? 1 : 0 })
                        }
                      />{' '}
                      Разрешить комментарии на моей стенке
                    </label>
                    <label>
                      <Checkbox
                        checked={!draft.collection_public}
                        onCheckedChange={(v) =>
                          setDraft({ ...draft, collection_public: v ? 0 : 1 })
                        }
                      />{' '}
                      Закрытый профиль — скрыть коллекцию и историю
                    </label>
                  </div>
                  <div className="profile-save-bar">
                    <span role="status">
                      {busy
                        ? 'Сохраняем изменения…'
                        : notice || 'Изменения сохраняются по кнопке'}
                    </span>
                    <button className="primary" disabled={busy}>
                      {busy ? 'Сохраняем…' : 'Сохранить профиль'}
                    </button>
                  </div>
                  <h3>Заблокированные пользователи</h3>
                  {blocks.length ? (
                    blocks.map((b) => (
                      <div className="blocked-row" key={b.id}>
                        {b.nick}
                        <button
                          type="button"
                          onClick={async () => {
                            await act('block', { id: b.id, value: false });
                            setBlocks(await api('blocks'));
                          }}
                        >
                          Разблокировать
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="muted">Никого нет в чёрном списке.</p>
                  )}
                  <AccountData />
                </form>
              )}
              {tab === 'notifications' && data.own && (
                <section className="social-panel">
                  <TelegramSettings />
                  <div className="panel-title">
                    <h3>Ответы и записи на стенке</h3>
                    <button
                      onClick={async () => {
                        await api('seen', {});
                        setNotifications(await api('notifications'));
                      }}
                    >
                      Прочитать все
                    </button>
                  </div>
                  {notifications.length ? (
                    notifications.map((n) => (
                      <a
                        className={'notification ' + (!n.seen ? 'unread' : '')}
                        key={n.id}
                        href={
                          n.scope.startsWith('wall:')
                            ? '/members/' +
                              n.scope.slice(5) +
                              '#comment-' +
                              n.comment_id
                            : '/?anime=' +
                              n.scope.split(':')[1] +
                              '&episode=' +
                              (n.scope.split(':')[3] || '')
                        }
                      >
                        <Bell size={18} />
                        <span>
                          <strong>{n.nick}</strong> оставил сообщение в твоём
                          обсуждении
                        </span>
                      </a>
                    ))
                  ) : (
                    <div className="social-empty">
                      <Bell size={28} />
                      <p>Здесь появятся ответы на твои комментарии.</p>
                    </div>
                  )}
                </section>
              )}
              {tab === 'moderation' && c.moderator && (
                <section className="social-panel">
                  <h3>Жалобы на комментарии</h3>
                  {reports.length ? (
                    reports.map((r) => (
                      <div className="report-card" key={r.id}>
                        <p>{r.body}</p>
                        <small>{r.reason}</small>
                        <div>
                          <button
                            onClick={async () => {
                              await act('moderate', { id: r.id, remove: true });
                              setReports(await api('reports'));
                            }}
                          >
                            Скрыть комментарий
                          </button>
                          <button
                            onClick={async () => {
                              await act('moderate', {
                                id: r.id,
                                remove: false,
                              });
                              setReports(await api('reports'));
                            }}
                          >
                            Отклонить жалобу
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="muted">Новых жалоб нет.</p>
                  )}
                </section>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
