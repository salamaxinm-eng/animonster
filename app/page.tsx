'use client';
import { useEffect, useState } from 'react';
import {
  Play,
  Bookmark,
  ArrowUpRight,
  Sparkles,
  Ghost,
  ChevronRight,
  Shuffle,
  Heart,
  Film,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PopularHero } from '@/components/popular-hero';
import { HomeDiscovery } from '@/components/home-discovery';
import { posterUrl, type Anime } from '@/lib/anime';
import { AccountNav, api, useCommunity } from '@/components/community/context';
import { GlobalSearch } from '@/components/global-search';
export default function Home() {
  const community = useCommunity();
  const [items, setItems] = useState<Anime[]>([]),
    [tab, setTab] = useState('all'),
    [saved, setSaved] = useState<Anime[]>([]),
    [favoriteIds, setFavoriteIds] = useState<number[]>([]),
    [apiStatus, setApiStatus] = useState(''),
    [catalogSort, setCatalogSort] = useState('rating'),
    [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [page, setPage] = useState(1),
    [pages, setPages] = useState(1),
    [total, setTotal] = useState(0),
    [catalogLoading, setCatalogLoading] = useState(false);
  useEffect(() => {
    if (!community.user) {
      setSaved([]);
      setFavoriteIds([]);
      return;
    }
    api('profile')
      .then((p) => {
        setFavoriteIds(
          p.entries.filter((e: any) => e.favorite).map((e: any) => e.anime_id),
        );
        setSaved(
          p.entries.map((e: any) => ({
            id: e.anime_id,
            russian: e.title,
            name: e.title,
            image: {
              original: e.image.replace('https://shikimori.one', ''),
            },
            score: '—',
            kind: 'tv',
            episodes: 0,
            aired_on: '',
          })),
        );
      })
      .catch(() => {});
  }, [community.user]);
  useEffect(() => {
    if (tab === 'saved') {
      setCatalogLoading(false);
      return;
    }
    const controller = new AbortController();
    setCatalogLoading(true);
    const timer = setTimeout(async () => {
      setApiStatus('Обновляем каталог…');
      try {
        const r = await fetch(
          '/api/catalog?kind=' +
            (tab === 'movies' ? 'movie' : tab === 'airing' ? 'ongoing' : '') +
            '&page=' +
            page +
            '&sort=' +
            catalogSort,
          { signal: controller.signal },
        );
        if (!r.ok) throw Error();
        setItems(await r.json());
        setTotal(Number(r.headers.get('X-Total-Count')) || 0);
        setPages(Number(r.headers.get('X-Total-Pages')) || 1);
        setApiStatus('');
      } catch {
        if (!controller.signal.aborted)
          setApiStatus(
            'Каталог временно недоступен. Попробуйте загрузить страницу снова.',
          );
      } finally {
        if (!controller.signal.aborted) setCatalogLoading(false);
      }
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [tab, page, catalogSort]);
  function has(id: number) {
    return favoriteIds.includes(id);
  }
  async function toggle(a: Anime) {
    if (!community.user) {
      community.login();
      return;
    }
    try {
      await api('favorite', { anime_id: a.id, value: !has(a.id) });
      setFavoriteIds(
        has(a.id)
          ? favoriteIds.filter((id) => id !== a.id)
          : [...favoriteIds, a.id],
      );
      if (!saved.some((x) => x.id === a.id)) setSaved([...saved, a]);
    } catch (e) {
      setApiStatus((e as Error).message);
    }
  }
  function open(a: Anime, startEpisode = 1) {
    location.assign('/anime/' + a.id + '?episode=' + startEpisode);
  }
  useEffect(() => {
    const p = new URLSearchParams(location.search),
      id = Number(p.get('anime'));
    if (id > 0)
      location.replace(
        '/anime/' + id + '?episode=' + (Number(p.get('episode')) || 1),
      );
  }, []);
  const shown = tab !== 'saved' ? items : saved;
  return (
    <div className="site">
      <header className="header">
        <a className="brand" href="/" aria-label="AniMonster — главная">
          <Ghost size={30} fill="currentColor" strokeWidth={1.7} />
          <span>
            Ani<span>Monster</span>
          </span>
        </a>
        <nav>
          <a href="#catalog">Каталог</a>
          <a href="/genres">Жанры</a>
          <a href="/recommendations">Рекомендации</a>
          <button
            onClick={() => {
              setTab('movies');
              setPage(1);
              document
                .getElementById('catalog')
                ?.scrollIntoView({ behavior: 'smooth' });
            }}
          >
            Фильмы
          </button>
          <button
            onClick={() => {
              setTab('saved');
              document
                .getElementById('catalog')
                ?.scrollIntoView({ behavior: 'smooth' });
            }}
          >
            Мой список <span className="count">{saved.length}</span>
          </button>
        </nav>
        <GlobalSearch />
        <button
          className="random"
          onClick={() =>
            items.length &&
            open(items[Math.floor(Math.random() * items.length)])
          }
        >
          <Shuffle size={17} />
          <span>Случайное аниме</span>
        </button>
        <AccountNav />
      </header>
      <main>
        <PopularHero initial={[]} onOpen={open} />
        <HomeDiscovery />
        <section id="catalog" className="catalog">
          <div className="section-head">
            <div>
              <div className="eyebrow small">ВЫБИРАЙ СВОЙ СЛЕДУЮЩИЙ МИР</div>
              <h2>
                {tab === 'saved' ? 'Мой список' : 'Стоит посмотреть'}
                <span className="lime">.</span>
              </h2>
            </div>
          </div>
          <div className="filter-row">
            <nav className="mobile-catalog-tabs" aria-label="Разделы каталога">
              <button
                className={tab === 'all' ? 'active' : ''}
                onClick={() => {
                  setTab('all');
                  setPage(1);
                }}
              >
                Все аниме
              </button>
              <button
                className={tab === 'airing' ? 'active' : ''}
                onClick={() => {
                  setTab('airing');
                  setPage(1);
                }}
              >
                Онгоинги
              </button>
              <a href="/genres">Жанры</a>
              <button onClick={() => setMobileFiltersOpen(true)}>
                <SlidersHorizontal size={15} /> Фильтры
              </button>
            </nav>
            <Tabs
              value={tab}
              onValueChange={(v) => {
                setTab(String(v));
                setPage(1);
              }}
            >
              <TabsList className="catalog-tabs">
                <TabsTrigger value="all">Все аниме</TabsTrigger>
                <TabsTrigger value="movies">Полнометражные</TabsTrigger>
                <TabsTrigger value="saved">
                  <Bookmark size={14} /> Мой список
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <span className="catalog-meta">
              {tab === 'saved' ? shown.length : total.toLocaleString('ru-RU')}{' '}
              тайтлов <span>·</span> AniLiberty
            </span>
          </div>
          {mobileFiltersOpen && (
            <div className="mobile-filter-overlay" role="presentation">
              <button
                className="mobile-filter-backdrop"
                onClick={() => setMobileFiltersOpen(false)}
                aria-label="Закрыть фильтры"
              />
              <section
                className="mobile-filter-sheet"
                role="dialog"
                aria-modal="true"
                aria-labelledby="mobile-filter-title"
              >
                <header>
                  <h3 id="mobile-filter-title">Фильтры каталога</h3>
                  <button
                    onClick={() => setMobileFiltersOpen(false)}
                    aria-label="Закрыть"
                  >
                    <X />
                  </button>
                </header>
                <div>
                  <strong>Тип</strong>
                  <nav>
                    <button
                      className={tab === 'all' ? 'active' : ''}
                      onClick={() => setTab('all')}
                    >
                      Все
                    </button>
                    <button
                      className={tab === 'airing' ? 'active' : ''}
                      onClick={() => setTab('airing')}
                    >
                      Онгоинги
                    </button>
                    <button
                      className={tab === 'movies' ? 'active' : ''}
                      onClick={() => setTab('movies')}
                    >
                      Фильмы
                    </button>
                  </nav>
                </div>
                <div>
                  <strong>Сортировка</strong>
                  <nav>
                    <button
                      className={catalogSort === 'rating' ? 'active' : ''}
                      onClick={() => setCatalogSort('rating')}
                    >
                      По рейтингу
                    </button>
                    <button
                      className={catalogSort === 'fresh' ? 'active' : ''}
                      onClick={() => setCatalogSort('fresh')}
                    >
                      Сначала новые
                    </button>
                  </nav>
                </div>
                <button
                  className="primary"
                  onClick={() => {
                    setPage(1);
                    setMobileFiltersOpen(false);
                  }}
                >
                  Показать
                </button>
              </section>
            </div>
          )}
          <p className="status" role="status">
            {apiStatus}
          </p>
          <div className="cards">
            {shown.map((a, i) => (
              <article className="card" key={a.id}>
                <a
                  className="poster"
                  href={'/anime/' + a.id}
                  aria-label={'Открыть ' + a.russian}
                >
                  <img
                    src={posterUrl(a)}
                    alt={a.russian}
                    loading={i < 6 ? 'eager' : 'lazy'}
                  />
                  <span className="score">★ {a.score}</span>
                  <span className="poster-play">
                    <Play fill="currentColor" size={23} />
                  </span>
                  <span className="poster-bottom">
                    {a.kind === 'movie'
                      ? 'ФИЛЬМ'
                      : `${a.episodes || '—'} СЕРИЙ`}
                    <ChevronRight size={17} />
                  </span>
                </a>
                <div className="card-title">
                  <a href={'/anime/' + a.id}>{a.russian || a.name}</a>
                  <button
                    className={has(a.id) ? 'saved' : ''}
                    onClick={() => toggle(a)}
                    aria-label={
                      has(a.id) ? 'Убрать из избранного' : 'В избранное'
                    }
                  >
                    <Heart
                      size={18}
                      fill={has(a.id) ? 'currentColor' : 'none'}
                    />
                  </button>
                </div>
                <p>
                  {a.aired_on?.slice(0, 4) || '—'} <span>•</span>{' '}
                  {a.kind === 'movie' ? 'Полнометражный фильм' : 'ТВ-сериал'}
                </p>
              </article>
            ))}
          </div>
          {tab !== 'saved' && pages > 1 && (
            <nav className="catalog-pagination" aria-label="Страницы каталога">
              <button
                className="primary"
                disabled={catalogLoading || page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Назад
              </button>
              <span>
                Страница {page} из {pages}
              </span>
              <button
                className="primary"
                disabled={catalogLoading || page >= pages}
                onClick={() => setPage(page + 1)}
              >
                Далее
              </button>
            </nav>
          )}
          {!shown.length && !catalogLoading && (
            <div className="empty">
              <Film size={30} />
              <h3>
                {tab === 'saved'
                  ? 'Здесь начинается твоя коллекция'
                  : 'Ничего не нашлось'}
              </h3>
              <p>
                {tab === 'saved'
                  ? 'Нажми на закладку рядом с названием аниме.'
                  : 'Попробуй другое название или открой все аниме.'}
              </p>
              <button
                className="primary"
                onClick={() => {
                  setPage(1);
                  setTab('all');
                }}
              >
                Открыть каталог
              </button>
            </div>
          )}
        </section>
        <section className="collection">
          <div className="collection-icon">
            <Sparkles size={28} />
          </div>
          <div>
            <span className="eyebrow small">НЕ ЗНАЕШЬ, ЧТО ВЫБРАТЬ?</span>
            <h2>Позволь случаю решить.</h2>
            <p>Иногда любимая история начинается с одного клика.</p>
          </div>
          <button
            onClick={() =>
              items.length &&
              open(items[Math.floor(Math.random() * items.length)])
            }
          >
            Удиви меня <ArrowUpRight size={20} />
          </button>
        </section>
      </main>
      <footer>
        <a className="brand" href="/">
          Ani<span>Monster</span>
        </a>
        <p>
          Каталог и эпизоды —{' '}
          <a href="https://aniliberty.top" target="_blank" rel="noreferrer">
            AniLiberty
          </a>
          . Доступность зависит от источника.
        </p>
        <span>Сделано для тех, кто любит аниме.</span>
      </footer>
    </div>
  );
}
