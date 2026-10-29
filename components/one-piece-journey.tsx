'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Anchor,
  Award,
  Check,
  Compass,
  Crown,
  Flag,
  LockKeyhole,
  Map,
  Ship,
  Trophy,
} from 'lucide-react';
import { CommunityHeader, useCommunity } from '@/components/community/context';
import type { PieceOverview } from '@/lib/one-piece';

const categories = [
  ['all', 'Все'],
  ['beginning', 'Начало путешествия'],
  ['arcs', 'Покоритель арок'],
  ['legend', 'Легенда морей'],
  ['secret', 'Секретные'],
  ['sagas', 'Коллекционер саг'],
];
const rarityNames: Record<string, string> = {
  common: 'Обычная',
  rare: 'Редкая',
  epic: 'Эпическая',
  legendary: 'Легендарная',
  mythic: 'Мифическая',
};
const icons = {
  flag: Flag,
  island: Anchor,
  crown: Crown,
  compass: Compass,
  trophy: Trophy,
  lock: LockKeyhole,
};
export function OnePieceJourney() {
  const community = useCommunity();
  const requestVersion = useRef(0);
  const [data, setData] = useState<PieceOverview | null>(null),
    [error, setError] = useState(''),
    [category, setCategory] = useState('all'),
    [status, setStatus] = useState('all'),
    [mode, setMode] = useState('achievements'),
    [island, setIsland] = useState<string | null>(null),
    [syncing, setSyncing] = useState(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    const version = ++requestVersion.current;
    try {
      const response = await fetch('/api/one-piece', {
          signal,
          cache: 'no-store',
        }),
        body = await response.json();
      if (!response.ok)
        throw Error(body.error || 'Не удалось загрузить путешествие');
      if (version !== requestVersion.current || signal?.aborted) return;
      setData(body);
      setError('');
    } catch (e) {
      if (!signal?.aborted && version === requestVersion.current)
        setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    const c = new AbortController();
    setData(null);
    if (community.loaded) void load(c.signal);
    return () => {
      requestVersion.current++;
      c.abort();
    };
  }, [community.loaded, community.user?.id, load]);
  useEffect(() => {
    const refresh = () => void load();
    window.addEventListener('one-piece-achievements', refresh);
    return () => window.removeEventListener('one-piece-achievements', refresh);
  }, [load]);
  useEffect(() => {
    const refresh = () => {
      if (!document.hidden) void load();
    };
    const timer = setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [load]);
  async function sync() {
    setSyncing(true);
    setError('');
    try {
      const r = await fetch('/api/one-piece', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync' }),
      });
      const b = await r.json();
      if (!r.ok) throw Error(b.error);
      window.dispatchEvent(new Event('one-piece-achievements'));
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSyncing(false);
    }
  }
  const selected = data?.arcs.find((arc) => arc.id === island);
  const items =
    data?.achievements.filter(
      (a) =>
        (category === 'all' || a.category === category) &&
        (status === 'all' ||
          (status === 'earned'
            ? a.completed
            : status === 'locked'
              ? !a.completed
              : !a.completed &&
                !a.secret &&
                a.available &&
                a.progress / a.threshold >= 0.8)),
    ) || [];
  return (
    <div className="site-shell">
      <CommunityHeader />
      <main className="op-journey">
        <header className="op-heading">
          <span className="eyebrow">
            <Ship size={18} /> ONE PIECE · ПУТЕШЕСТВИЕ
          </span>
          <h1>Твой пиратский путь</h1>
          <p>
            От первого отплытия до звания Короля пиратов. Смотри, открывай
            острова и собирай награды.
          </p>
          <a href="/anime/21">Продолжить One Piece →</a>
        </header>
        {error && (
          <p className="error-msg" role="alert">
            {error} <button onClick={() => void load()}>Повторить</button>
          </p>
        )}
        {!data && !error && <p role="status">Прокладываем маршрут…</p>}
        {data && (
          <>
            {!data.authenticated && (
              <div className="op-callout">
                Войди, чтобы сохранять путь и получать награды.{' '}
                <button onClick={community.login}>Войти</button>
              </div>
            )}
            <section className="op-stats" aria-label="Статистика путешествия">
              <div>
                <small>Твой ранг</small>
                <strong>{data.rank}</strong>
              </div>
              <div>
                <small>Просмотрено</small>
                <strong>{data.count.toLocaleString('ru-RU')} серий</strong>
              </div>
              <div>
                <small>Достижения</small>
                <strong>
                  {data.unlocked} / {data.achievements.length}
                </strong>
              </div>
              <div>
                <small>Опыт путешествия</small>
                <strong>{data.xp.toLocaleString('ru-RU')} XP</strong>
              </div>
              <div className="op-route-total">
                <span>Текущая сага: {data.currentSaga}</span>
                <strong>{data.progress}%</strong>
                <progress
                  max={100}
                  value={data.progress}
                  aria-label="Прогресс путешествия"
                />
              </div>
            </section>
            <p className="op-explanation">
              Серия засчитывается после воспроизведения 90% разных участков.
              Перемотка не добавляет пропущенное время. Старые отметки
              «просмотрено» без таких данных не засчитываются автоматически.
            </p>
            <div
              className="op-switch"
              role="group"
              aria-label="Режим путешествия"
            >
              <button
                aria-pressed={mode === 'achievements'}
                onClick={() => setMode('achievements')}
              >
                <Award size={18} /> Достижения
              </button>
              <button
                aria-pressed={mode === 'map'}
                onClick={() => setMode('map')}
              >
                <Map size={18} /> Карта Гранд Лайн
              </button>
            </div>
            {mode === 'map' ? (
              <section aria-label="Карта Гранд Лайн">
                <p className="op-explanation">
                  Нажми на остров, чтобы увидеть свой прогресс. Завершённые арки
                  открыты; текущая подсвечена.
                </p>
                <ol className="op-islands">
                  {data.arcs.map((a, index) => (
                    <li
                      key={a.id}
                      className={`${a.completed ? 'earned' : ''} ${a.current ? 'current' : ''}`}
                    >
                      <button
                        onClick={() => setIsland(a.id)}
                        aria-pressed={island === a.id}
                      >
                        <span className="op-island-icon">
                          {a.completed ? <Check /> : <Anchor />}
                        </span>
                        <small>
                          {String(index + 1).padStart(2, '0')} · {a.saga}
                        </small>
                        <strong>{a.name}</strong>
                        <span>
                          {a.progress} / {a.total} серий
                        </span>
                        {a.current && <em>Ты здесь</em>}
                      </button>
                    </li>
                  ))}
                </ol>
                {selected && (
                  <aside className="op-island-detail" aria-live="polite">
                    <h2>{selected.name}</h2>
                    <p>
                      Просмотрено {selected.progress} из {selected.total}.
                      Осталось {Math.max(0, selected.total - selected.progress)}
                      .
                    </p>
                    {!selected.available && (
                      <p>
                        Арка ещё не завершена: полный список не подтверждён.
                      </p>
                    )}
                    {selected.achievement ? (
                      <p>
                        Достижение:{' '}
                        {
                          data.achievements.find(
                            (a) => a.code === selected.achievement,
                          )?.name
                        }{' '}
                        · +{selected.reward} XP
                      </p>
                    ) : (
                      <p>Эта арка входит в маршрут саги.</p>
                    )}
                  </aside>
                )}
              </section>
            ) : (
              <>
                <div
                  className="op-categories"
                  role="group"
                  aria-label="Категории достижений"
                >
                  {categories.map(([key, label]) => (
                    <button
                      key={key}
                      aria-pressed={category === key}
                      onClick={() => setCategory(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="op-filter">
                  <label>
                    Показать{' '}
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                    >
                      <option value="all">Все достижения</option>
                      <option value="earned">Полученные</option>
                      <option value="locked">Неполученные</option>
                      <option value="almost">Почти завершённые</option>
                    </select>
                  </label>
                  <span>{items.length} достижений</span>
                </div>
                <div className="op-achievements">
                  {items.map((a) => {
                    const Icon = icons[a.icon as keyof typeof icons] || Award;
                    return (
                      <article
                        key={a.id}
                        className={`op-achievement op-rarity-${a.rarity} ${a.completed ? 'earned' : ''}`}
                      >
                        <span className="op-medal">
                          <Icon size={28} />
                        </span>
                        <div>
                          <span className="op-rarity">
                            {rarityNames[a.rarity]}
                          </span>
                          <h2>{a.name}</h2>
                          <p>{a.description}</p>
                          {a.completed ? (
                            <small>
                              Получено{' '}
                              {new Date(a.unlocked_at!).toLocaleDateString(
                                'ru-RU',
                              )}
                            </small>
                          ) : a.secret ? (
                            <small>
                              <LockKeyhole size={13} /> Условие скрыто
                            </small>
                          ) : !a.available ? (
                            <small>
                              Недоступно до подтверждения полного списка серий
                            </small>
                          ) : (
                            <>
                              <small>
                                {a.progress} / {a.threshold}
                              </small>
                              <progress
                                max={a.threshold}
                                value={a.progress}
                                aria-label={`Прогресс ${a.name}`}
                              />
                            </>
                          )}
                          <div className="op-reward">
                            +{a.xp_reward} XP
                            {a.rewards.map((r) => (
                              <span key={r.slug}>{r.name}</span>
                            ))}
                          </div>
                        </div>
                        {a.completed && (
                          <Check
                            className="op-earned-check"
                            aria-label="Получено"
                          />
                        )}
                      </article>
                    );
                  })}
                </div>
                {!items.length && (
                  <p className="op-callout">
                    В этом фильтре пока нет достижений.
                  </p>
                )}
              </>
            )}
            {data.authenticated && (
              <div className="op-sync">
                <button disabled={syncing} onClick={() => void sync()}>
                  {syncing
                    ? 'Сверяем…'
                    : 'Синхронизировать подтверждённую историю'}
                </button>
                <small>
                  Без повторных наград и без зачёта неподтверждённых старых
                  отметок.
                </small>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
