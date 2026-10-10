'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Copy, Download, Globe2, LockKeyhole, Search, Stamp, Trophy } from 'lucide-react';
import type { Anime } from '@/lib/anime';
import { proxyImageUrl } from '@/lib/anime';
import type { Passport } from '@/lib/server/passport';
import { CommunityHeader, Avatar, UserTag } from './community/context';
import './anime-passport.css';

export function PassportPage({ id }: { id?: string }) {
  const [passport, setPassport] = useState<Passport | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Anime[]>([]);
  const [selected, setSelected] = useState<Passport['favorites']>([]);
  const [awards, setAwards] = useState<string[]>([]);
  const [visibility, setVisibility] = useState(false);
  async function load() {
    const response = await fetch('/api/passport' + (id ? '?id=' + encodeURIComponent(id) : ''), { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Не удалось загрузить паспорт');
    setPassport(data);
    setSelected(data.favorites);
    setAwards(data.awards.map((item: { id: string }) => item.id));
    setVisibility(data.public);
  }
  useEffect(() => { void load().catch((e) => setError(e.message)); }, [id]);
  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch('/api/catalog?q=' + encodeURIComponent(query.trim()), { signal: controller.signal })
        .then((response) => response.json()).then((data) => {
          if (Array.isArray(data)) setResults(data.slice(0, 8));
        }).catch(() => {});
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);
  async function save() {
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/passport', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_public: visibility, favorite_ids: selected.map((item) => item.id), award_ids: awards }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Не удалось сохранить');
      await load();
      setNotice('Паспорт сохранён');
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(location.origin + '/members/' + p!.user.id + '/passport'); setNotice('Ссылка скопирована'); }
    catch { setError('Не удалось скопировать ссылку'); }
  }
  const p = passport;
  const base = '/api/passport/image' + (id ? '?id=' + encodeURIComponent(id) : '?self=1');
  const maxMonth = Math.max(1, ...(p?.months || []).map((m) => m.episodes));
  return <div className="passport-site">
    <CommunityHeader />
    <main className="passport-wrap">
      <nav className="passport-crumb"><Link href={p?.own ? '/profile' : '/members/' + id}>Профиль</Link><span>/</span>Аниме-паспорт</nav>
      {!p ? <div className="passport-empty">{error || 'Загрузка паспорта…'}</div> : <>
        <div className="passport-heading"><div><p className="passport-eyebrow"><Stamp size={16} /> ANIMONSTER · ЛИЧНОЕ ДОСЬЕ</p><h1>Аниме-паспорт</h1><p>История просмотра в одном месте.</p></div>
          <span className="passport-visibility">{p.public ? <Globe2 size={16} /> : <LockKeyhole size={16} />}{p.public ? 'Публичный' : 'Скрытый'}</span></div>
        <section className="passport-cover-card">
          <div className="passport-card-top"><strong>Ani<span>Monster</span></strong><small>АНИМЕ-ПАСПОРТ</small></div>
          <div className="passport-person"><Avatar avatar={p.user.avatar} large /><div><h2>{p.user.nick}</h2><UserTag id={p.user.tag} /><p>На AniMonster с {new Date(Number(p.user.created_at)).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</p></div></div>
          <div className="passport-identity-line"><span>№ {p.user.number}</span><span>АРХЕТИП · {p.archetype.name}</span></div>
        </section>
        <section className="passport-stats">
          {[
            ['Просмотрено серий', p.episodes.toLocaleString('ru-RU')],
            ['Время в аниме', p.watch_seconds ? p.watch_seconds < 3600 ? 'Меньше 1 ч' : p.watch_seconds < 86400 ? `${Math.floor(p.watch_seconds / 3600)} ч` : `${Math.floor(p.watch_seconds / 3600)} ч · ${(p.watch_seconds / 86400).toFixed(1)} дн.` : 'Нет подтверждённого времени'],
            ['Просмотрено аниме', String(p.anime_count)],
            ['Завершено аниме', p.completed_anime === null ? 'Нет надёжных данных' : String(p.completed_anime)],
            ['Любимый жанр', p.favorite_genre || 'Пока не определён'],
            ['Самое длинное аниме', p.longest_anime ? `${p.longest_anime.title} · ${p.longest_anime.episodes} серий` : 'Пока нет'],
            ['Текущий огонёк', String(p.user.streak) + ' дн.'],
            ['Рекорд', String(p.user.longest_streak) + ' дн.'],
          ].map(([label, value]) => <div className="passport-stat" key={label}><small>{label}</small><strong>{value}</strong></div>)}
        </section>
        <section className="passport-two-col">
          <div className="passport-panel"><h2>Твой архетип</h2><div className="passport-archetype">{p.archetype.name}</div><p>{p.archetype.reason}</p></div>
          <div className="passport-panel"><h2>Любимые жанры</h2>{p.genres.length ? p.genres.map((g) => <div className="passport-genre" key={g.name}><div><span>{g.name}</span><b>{g.percent}%</b></div><i><em style={{ width: g.percent + '%' }} /></i></div>) : <p>Жанры появятся после просмотра аниме.</p>}<small>Процент от просмотренных тайтлов. Одно аниме может относиться к нескольким жанрам.</small></div>
        </section>
        <section className="passport-two-col">
          <div className="passport-panel"><h2>Моя тройка</h2>{p.favorites.length ? <div className="passport-favorites">{p.favorites.map((item, i) => <Link href={'/anime/' + item.id} key={item.id} className="passport-favorite"><span>0{i + 1}</span>{item.image && <img src={proxyImageUrl(item.image)} alt="" />}<strong>{item.title}</strong></Link>)}</div> : <p>Выберите три любимых аниме из каталога — этот блок составляется вручную.</p>}</div>
          <div className="passport-panel"><h2><Trophy size={19} /> Гордость коллекции</h2>{p.awards.length ? <div className="passport-awards">{p.awards.map((award) => <div key={award.id}>{award.image && <img src={award.image} alt="" />}<span>{award.name}</span></div>)}</div> : <p>Здесь можно показать до трёх полученных достижений или пинов.</p>}</div>
        </section>
        <section className="passport-panel"><h2>Аниме-итоги</h2><div className="passport-summary"><div><small>За 30 дней</small><strong>{p.last_30_days} серий</strong></div><div><small>Самый активный день</small><strong>{p.best_day ? `${p.best_day.date} · ${p.best_day.episodes}` : 'Пока нет данных'}</strong></div><div><small>К прошлому месяцу</small><strong>{p.month_change === null ? 'Нет данных для сравнения' : (p.month_change > 0 ? '+' : '') + p.month_change + '%'}</strong></div></div>
          {p.months.length ? <div className="passport-chart" aria-label="Просмотры по месяцам">{p.months.map((m) => <div key={m.month}><span style={{ height: Math.max(4, m.episodes / maxMonth * 100) + '%' }} title={m.month + ': ' + m.episodes + ' серий'} /><small>{m.month.slice(5)}</small></div>)}</div> : <p>Датированных просмотров пока нет.</p>}
          {p.dated_history_incomplete && <p className="passport-note">Часть старой истории не имеет даты и не входит в график.</p>}</section>
        {p.own && <section className="passport-panel passport-editor"><h2>Настроить паспорт</h2><label className="passport-switch"><input type="checkbox" checked={visibility} onChange={(e) => setVisibility(e.target.checked)} /><span>Публичный доступ</span></label><p>Скрытый паспорт доступен только вам. PNG можно скачать в любом случае.</p>
          <h3>Моя тройка · {selected.length}/3</h3><div className="passport-selected">{selected.map((item) => <button key={item.id} onClick={() => setSelected(selected.filter((x) => x.id !== item.id))}>{item.title} ×</button>)}</div>
          <label className="passport-search"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Найти аниме в каталоге" /></label>
          {!!results.length && <div className="passport-results">{results.map((item) => <button key={item.id} disabled={selected.length >= 3 || selected.some((x) => x.id === item.id)} onClick={() => { setSelected([...selected, { id: item.id, title: item.russian || item.name, image: item.image?.original || '' }]); setQuery(''); }}>{item.russian || item.name}</button>)}</div>}
          <h3>Гордость коллекции · {awards.length}/3</h3><div className="passport-award-options">{p.available_awards?.length ? p.available_awards.map((item) => <label key={item.id}><input type="checkbox" checked={awards.includes(item.id)} disabled={!awards.includes(item.id) && awards.length >= 3} onChange={(e) => setAwards(e.target.checked ? [...awards, item.id] : awards.filter((x) => x !== item.id))} />{item.name}</label>) : <p>Пока нет полученных наград.</p>}</div>
          <button className="passport-primary" disabled={busy} onClick={save}>{busy ? 'Сохранение…' : 'Сохранить паспорт'}</button>
        </section>}
        <section className="passport-actions">{p.public && <button onClick={copy}><Copy size={16} /> Скопировать публичную ссылку</button>}<a href={base + '&format=portrait&download=1'}><Download size={16} /> PNG 1080×1350</a><a href={base + '&format=wide&download=1'}><Download size={16} /> PNG 1200×630</a></section>
        {notice && <p className="passport-notice" role="status">{notice}</p>}{error && <p className="passport-error" role="alert">{error}</p>}
      </>}
    </main>
  </div>;
}
