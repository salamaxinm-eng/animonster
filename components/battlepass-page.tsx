'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Check, ArrowUpRight, Crown, Gift, Lock, RotateCcw, Sparkles } from 'lucide-react';
import { CommunityHeader, useCommunity } from './community/context';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { ProfileIdentity } from './community/profile-hub/profile-identity';
import type { Profile } from '@/lib/community';
import type { PassReward, passOverview } from '@/lib/server/battlepass';
type Overview = Awaited<ReturnType<typeof passOverview>> & { canManage: boolean };
type Ready = Extract<Overview, { xp: number }>;
const labels = { daily: 'Ежедневные', weekly: 'Недельные', seasonal: 'Сезонные' };
const date = (stamp: number, zone: string) => new Date(Number(stamp)).toLocaleDateString('ru-RU', { timeZone: zone, day: 'numeric', month: 'long' });
export function BattlepassPage() {
  const community = useCommunity(), params = useSearchParams();
  const [data, setData] = useState<Overview | null>(null), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<keyof typeof labels>('daily'), [selected, setSelected] = useState<PassReward | null>(null), [clock, setClock] = useState(Date.now());
  const [chapter, setChapter] = useState(0);
  const positioned = useRef(''), checkedPayment = useRef('');
  const seasonId = params.get('season') || '', preview = params.get('preview') === '1';
  const load = useCallback(async () => {
    const r = await fetch(`/api/battlepass?${new URLSearchParams({ ...(seasonId ? { season: seasonId } : {}), ...(preview ? { preview: '1' } : {}) })}`, { cache: 'no-store' });
    const value = await r.json(); if (!r.ok) throw new Error(value.error); setData(value);
  }, [seasonId, preview]);
  useEffect(() => { if (community.loaded) void load().catch((e) => setError(e.message)); }, [load, community.loaded, community.user?.id]);
  useEffect(() => { const tick = setInterval(() => setClock(Date.now()), 30000); const refresh = setInterval(() => void load().catch(() => {}), 30000); return () => { clearInterval(tick); clearInterval(refresh); }; }, [load]);
  const season = data?.season;
  const ready = data?.season ? data as Ready : null;
  useEffect(() => {
    if (!ready?.season || positioned.current === ready.season.id) return;
    setChapter(Math.min(3, Math.floor(Math.max(0, ready.level - 1) / 10)));
    positioned.current = ready.season.id;
  }, [ready]);
  const mutate = async (path: string, input: unknown) => {
    const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    const v = await r.json(); if (!r.ok) throw new Error(v.error); return v;
  };
  useEffect(() => {
    if (!community.user || !season || params.get('payment') !== 'return' || checkedPayment.current === season.id) return;
    checkedPayment.current = season.id;
    void mutate('/api/battlepass/purchase', { action: 'check', season: season.id }).then((v) => { setNotice(v.status === 'succeeded' ? 'Платёж подтверждён. Доступ обновлён.' : 'Платёж ещё не подтверждён. Можно проверить статус повторно.'); return load(); }).catch((e) => setError(e.message));
  }, [community.user?.id, season?.id, params, load]);
  async function action(kind: 'claim' | 'purchase' | 'check' | 'reroll', week?: number) {
    if (!community.user) { community.login(); return; }
    if (!season || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await mutate(kind === 'purchase' || kind === 'check' ? '/api/battlepass/purchase' : '/api/battlepass', { action: kind, season: season.id, week });
      if (result.url) window.location.assign(result.url);
      else { setNotice(kind === 'claim' ? `Наград получено: ${result.count}. Награды добавлены в аккаунт.` : kind === 'check' ? `Статус платежа: ${result.status === 'succeeded' ? 'подтверждён' : result.status === 'pending' ? 'ожидает оплаты' : result.status === 'not_found' ? 'платёж не найден' : result.status}` : 'Жанр заменён. Прогресс остальных заданий сохранён.'); await load(); }
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const previewUser: Profile | null = community.user && selected && selected.kind !== 'plus' ? { ...community.user,
    ...(selected.kind === 'frame' ? { profile_frame: selected.slug } : selected.kind === 'background' ? { profile_background: selected.preview } : { [selected.kind]: selected.slug }) } : null;
  const kindLabels = {pin:'Пин',frame:'Рамка',tag:'Тег',background:'Фон профиля',plus:'AniMonster Plus'};
  function rewardCard(r: PassReward) {
    const claimable = r.available && !r.claimed;
    return <button key={r.cosmetic_id} className={`pass-card ${r.kind} ${r.track} ${r.claimed ? 'claimed' : claimable ? 'available' : ''}`} onClick={() => setSelected(r)} aria-label={`Уровень ${r.level}: ${r.name}. ${r.claimed ? 'Получено' : claimable ? 'Можно забрать' : 'Посмотреть награду'}`}>
      <span className="pass-card-top"><b>{String(r.level).padStart(2,'0')} <small>ур.</small></b><span>{kindLabels[r.kind]}</span></span>
      <span className="pass-card-art">{r.kind === 'plus' ? <span className="pass-plus-art"><Crown size={34} /><b>+{r.plus_days}<small>дня Плюса</small></b></span> : <img src={r.preview} alt="" loading="lazy" />}</span>
      <strong>{r.name}</strong><span className="pass-card-state">{r.claimed ? <><Check size={13} /> Получено</> : claimable ? <><Gift size={13} /> Можно забрать</> : <><Lock size={12} /> {r.level > (ready?.level || 0) ? `${r.level * 400} XP` : season?.status === 'draft' ? 'Скоро в коллекции' : r.track === 'premium' ? 'Нужен премиум' : 'Откроется в сезоне'}</>}</span>
    </button>;
  }
  return <div className="site-shell pass-site"><CommunityHeader account /><main className="pass-main">
    <div className="pass-heading"><span>ANIMONSTER PASS</span>{data?.canManage && <a href="/admin/battlepass">Управление сезонами</a>}</div>
    {error && <p className="pass-message error" role="alert">{error}</p>}{notice && <p className="pass-message" role="status">{notice}</p>}
    {!data ? <p role="status">Загружаем сезон…</p> : !season || !ready ? <section className="pass-empty"><Gift size={40} /><h1>Следующий сезон готовится</h1><p>Здесь появятся задания и коллекция AniMonster Pass.</p>{data?.canManage && <a href="/battlepass?season=oni-awakening&preview=1">Открыть черновик «Пробуждение Oni»</a>}</section> : <>
      {season.status === 'draft' && <p className="pass-message">Черновик · доступен только администратору. Участие и оплата ещё не открыты.</p>}
      <section className="pass-hero">
        <img className="pass-hero-landscape" src={ready.rewards.find(r => r.kind === 'background' && r.level === 5)?.preview || ready.rewards.find(r => r.kind === 'background')?.preview} alt="" />
        <div className="pass-hero-copy">
          <p className="pass-kicker"><Sparkles size={14} /> КОЛЛЕКЦИЯ СЕЗОНА · 8 НЕДЕЛЬ</p>
          <h1>{season.id === 'anime-worlds-2026' ? <>Четыре мира.<br /><em>Твоя история.</em></> : season.title}</h1>
          <p className="pass-subtitle">Смотри любимое аниме, открывай уровни<br className="pass-desktop-break" /> и собирай оформление, которое останется с тобой.</p>
          <div className="pass-season-stats"><span><b>40</b> уровней</span><span><b>{ready.rewards.filter(r => r.kind !== 'plus').length}</b> предмета</span><span><b>{ready.rewards.filter(r => r.track === 'premium').reduce((n,r) => n + Number(r.plus_days || 0),0)}</b> дней Плюса</span></div>
          <div className="pass-purchase">{ready.premium ? <span className="pass-unlocked"><Check size={18} /> Премиум открыт</span> : <Button disabled={busy || !ready.active} onClick={() => void action('purchase')}><Crown size={18} /> Открыть премиум <span>{season.price.toLocaleString('ru-RU')} ₽</span><ArrowUpRight size={18} /></Button>}</div>
          <p className="pass-fine">Одна покупка на сезон · Без автопродления</p>
          {!community.user ? <button className="pass-text-button" onClick={community.login}>Войти и начать бесплатно →</button> : !ready.premium && <button className="pass-text-button" onClick={() => void action('check')} disabled={busy}>Уже оплатили? Проверить платёж</button>}
        </div>
        <div className="pass-hero-showcase" aria-label="Предметы коллекции">
          <span className="pass-showcase-eyebrow">СОБЕРИ СВОЮ ЛЕГЕНДУ</span>
          {ready.rewards.filter(r => r.track === 'premium' && (r.level === 23 || r.level === 22 || r.level === 25)).map(r => <button key={r.cosmetic_id} className={`pass-showcase-${r.kind}`} onClick={() => setSelected(r)} aria-label={`Посмотреть ${r.name}`}><img src={r.preview} alt={r.name} /></button>)}
          <span className="pass-showcase-caption">Пины · Рамки · Теги · Фоны</span>
        </div>
        <div className="pass-hero-footer"><span>{season.starts_at ? `${date(season.starts_at, season.timezone)} — ${date(season.ends_at, season.timezone)}` : 'Даты скоро появятся'}</span><span className="pass-countdown">{season.ends_at > 0 ? clock >= Number(season.ends_at) ? 'Сезон завершён' : clock < Number(season.starts_at) ? 'Скоро старт' : `Осталось ${Math.ceil((Number(season.ends_at) - clock) / 86400000)} дн.` : 'Новый сезон'}</span></div>
      </section>
      <section className="pass-progress-panel" aria-label="Ваш прогресс">
        <div className="pass-level-badge">{ready.level}<small>УРОВЕНЬ</small></div>
        <div className="pass-progress-copy"><div><b>{community.user ? 'Твой путь к 40 уровню' : 'Твоя коллекция начинается здесь'}</b><span>{ready.xp.toLocaleString('ru-RU')} / 16 000 XP</span></div><progress max={16000} value={Math.min(16000, ready.xp)} aria-label="Прогресс сезона" /><small>{ready.nextXp ? `${ready.nextXp} XP до следующего уровня` : 'Все уровни открыты'} · Общий прогресс обеих веток</small></div>
        <Button variant="outline" disabled={busy || !ready.rewards.some(r => r.available && !r.claimed)} onClick={() => void action('claim')}><Gift size={17} /> Забрать награды</Button>
      </section>
      <section className="pass-rewards">
        <div className="pass-section-heading"><div><span className="pass-kicker"><Crown size={14} /> ПРЕМИАЛЬНАЯ ВЕТКА</span><h2>Новый уровень. Новая награда.</h2></div><span>Нажми на предмет, чтобы рассмотреть</span></div>
        <div className="pass-chapters" role="group" aria-label="Группы уровней">{['Начало пути','Новая сила','За горизонтом','Твоя легенда'].map((name,i) => <button key={name} aria-pressed={chapter === i} onClick={() => setChapter(i)}><span>{String(i * 10 + 1).padStart(2,'0')}—{(i + 1) * 10}</span><b>{name}</b></button>)}</div>
        <div className="pass-collection-grid">{Array.from({length:10},(_,i) => chapter * 10 + i + 1).map(level => <div key={level} className="pass-collection-slot">{ready.rewards.filter(r => r.track === 'premium' && r.level === level).map(r => rewardCard(r))}{!ready.rewards.some(r => r.track === 'premium' && r.level === level) && <div className="pass-missing">Уровень {level}<span>Награда готовится</span></div>}</div>)}</div>
      </section>
      <section className="pass-free-section"><div className="pass-section-heading"><div><span className="pass-kicker"><Gift size={14} /> БЕСПЛАТНАЯ ВЕТКА</span><h2>Награды для каждого</h2></div><span>На уровнях 10, 20, 30 и 40 · Премиум не нужен</span></div><div className="pass-free-grid">{ready.rewards.filter(r => r.track === 'free').map(r => rewardCard(r))}</div></section>
      <section className="pass-quests"><div className="pass-section-heading"><div><span className="pass-kicker">ТВОЙ ПУТЬ</span><h2>Смотри в своём ритме</h2></div><span>Пропущенный день не отнимает XP</span></div>
        <div className="pass-tabs" role="tablist" aria-label="Задания">{Object.entries(labels).map(([key, label]) => <button role="tab" aria-selected={tab === key} aria-controls="pass-task-panel" id={`pass-tab-${key}`} key={key} onClick={() => setTab(key as keyof typeof labels)}>{label}</button>)}</div>
        <div role="tabpanel" id="pass-task-panel" aria-labelledby={`pass-tab-${tab}`}>{ready.tasks.filter((g) => g.group === tab).map((group) => <div className="pass-task-group" key={group.scope}><div className="pass-task-heading"><h3>{tab === 'weekly' ? `Комплект недели ${group.scope.split(':')[1]}` : tab === 'daily' ? 'Сегодня' : 'На весь сезон'}</h3><span>{group.endsAt ? `До ${date(group.endsAt, season.timezone)}` : 'Срок будет объявлен'}</span></div>
          {tab === 'weekly' && <div className="pass-genre"><span>Жанр: <b>{group.genre || 'Будет выбран перед публикацией'}</b></span><button disabled={busy || !ready.active || group.rerolled || group.tasks.some((t) => t.id === 'genre3' && t.completed)} onClick={() => void action('reroll', Number(group.scope.split(':')[1]))}><RotateCcw size={13} /> {group.rerolled ? 'Замена использована' : 'Заменить бесплатно · 1 раз'}</button>{group.genre && <a href={`/catalog?genre=${encodeURIComponent(group.genre)}`}>Выбрать аниме →</a>}</div>}
          <div className="pass-task-grid">{group.tasks.map((task) => <article className={task.completed ? 'complete' : ''} key={task.id}><div><h4>{task.title}</h4><b>{task.completed ? <Check size={18} /> : `+${task.xp} XP`}</b></div><progress max={task.target} value={task.progress} aria-label={task.title} /><span>{task.metric === 'seconds' ? `${Math.floor(task.progress / 60)} / ${task.target / 60} мин.` : `${task.progress} / ${task.target}`} {task.completed ? '· XP начислен' : ''}</span></article>)}</div>
        </div>)}{tab === 'weekly' && !ready.tasks.some((g) => g.group === 'weekly') && <p className="pass-fine">Первый комплект откроется в начале сезона. Следующие — каждые 7 дней.</p>}</div>
        <p className="pass-fine">Ежедневные пороги накапливаются: 40 минут = 200 XP. Открытые недельные комплекты доступны до конца сезона. Для жанрового задания нужно посмотреть 80% каждой серии; перемотка и смена озвучки не добавляют просмотренные участки.</p>
      </section>
    </>}
    {!!data?.history.length && <section className="pass-history"><h2>История сезонов</h2>{data.history.map((h: any) => <a href={`/battlepass?season=${encodeURIComponent(h.id)}`} key={h.id}>{h.title}<span>{h.xp} XP · {h.premium ? 'Премиум' : 'Бесплатный'}</span></a>)}</section>}
    <Dialog open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null); }}><DialogContent className="pass-reward-dialog"><DialogTitle>{selected?.name}</DialogTitle><DialogDescription>Уровень {selected?.level} · {selected?.track === 'premium' ? 'Премиальная' : 'Бесплатная'} дорожка. {selected?.kind === 'plus' ? 'Продлевает Плюс с сохранением оплаченного срока.' : 'Оформление остаётся навсегда.'}</DialogDescription>{selected && (selected.kind === 'plus' ? <div className="pass-plus-reward"><Crown size={64} /><strong>+{selected.plus_days} дня Плюса</strong></div> : <img className="pass-large-preview" src={selected.preview} alt={selected.name} />)}{previewUser && <ProfileIdentity user={previewUser} preview />}{selected?.kind === 'plus' ? <p className="pass-fine">{selected.claimed ? 'Дни Плюса уже начислены.' : 'Начисляется один раз после получения награды.'}</p> : selected?.claimed ? <a className="hub-button" href="/profile?section=appearance">Применить в оформлении профиля →</a> : <p className="pass-fine">{previewUser ? 'Примерка: оформление профиля пока не изменено.' : 'Войдите, чтобы примерить награду на свой профиль.'}</p>}</DialogContent></Dialog>
  </main></div>;
}
