'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Check, ChevronLeft, ChevronRight, Crown, Gift, Lock, RotateCcw } from 'lucide-react';
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
  const rail = useRef<HTMLDivElement>(null), positioned = useRef(''), checkedPayment = useRef('');
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
    const target = rail.current?.querySelector<HTMLElement>(`[data-level="${Math.max(1, ready.level)}"]`);
    if (target && rail.current) { rail.current.scrollLeft = Math.max(0, target.offsetLeft - rail.current.offsetLeft - 20); positioned.current = ready.season.id; }
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
      else { setNotice(kind === 'claim' ? `Наград получено: ${result.count}. Оформление в вашей коллекции.` : kind === 'check' ? `Статус платежа: ${result.status === 'succeeded' ? 'подтверждён' : result.status === 'pending' ? 'ожидает оплаты' : result.status === 'not_found' ? 'платёж не найден' : result.status}` : 'Жанр заменён. Прогресс остальных заданий сохранён.'); await load(); }
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const previewUser: Profile | null = community.user && selected ? { ...community.user,
    ...(selected.kind === 'frame' ? { profile_frame: selected.slug } : selected.kind === 'background' ? { profile_background: selected.preview } : { [selected.kind]: selected.slug }) } : null;
  return <div className="social-site pass-site"><CommunityHeader account /><main className="pass-main">
    <div className="pass-heading"><span>ANIMONSTER PASS</span>{data?.canManage && <a href="/admin/battlepass">Управление сезонами</a>}</div>
    {error && <p className="pass-message error" role="alert">{error}</p>}{notice && <p className="pass-message" role="status">{notice}</p>}
    {!data ? <p role="status">Загружаем сезон…</p> : !season || !ready ? <section className="pass-empty"><Gift size={40} /><h1>Следующий сезон готовится</h1><p>Здесь появятся задания и коллекция AniMonster Pass.</p>{data?.canManage && <a href="/battlepass?season=oni-awakening&preview=1">Открыть черновик «Пробуждение Oni»</a>}</section> : <>
      {season.status === 'draft' && <p className="pass-message">Черновик · доступен только администратору. Участие и оплата ещё не открыты.</p>}
      <section className="pass-hero">
        <div className="pass-hero-copy"><p className="pass-kicker">СЕЗОН · 8 НЕДЕЛЬ</p><h1>{season.title}</h1><p className="pass-subtitle">Твои истории становятся частью тебя.<br />Смотри аниме. Собирай оформление навсегда.</p>
          <p className="pass-dates">{season.starts_at ? `${date(season.starts_at, season.timezone)} — ${date(season.ends_at, season.timezone)}` : 'Даты будут объявлены'} · {season.timezone}</p>
          {season.ends_at > 0 && <p className="pass-countdown">{clock >= Number(season.ends_at) ? 'Сезон завершён' : clock < Number(season.starts_at) ? 'Сезон скоро начнётся' : `Осталось ${Math.ceil((Number(season.ends_at) - clock) / 86400000)} дн.`}</p>}
          <div className="pass-level"><strong>{ready.level}<small> / 40</small></strong><div><b>Текущий уровень</b><span>{ready.nextXp ? `${ready.nextXp} XP до следующего уровня` : 'Все уровни открыты'} · {ready.xp.toLocaleString('ru-RU')} XP</span></div></div>
          <progress className="pass-progress" max={16000} value={Math.min(16000, ready.xp)} aria-label="Прогресс сезона" />
          <div className="pass-purchase">{ready.premium ? <span className="pass-unlocked"><Check size={18} /> Премиум открыт</span> : <Button disabled={busy || !ready.active} onClick={() => void action('purchase')}><Crown size={17} /> Открыть премиум · {season.price.toLocaleString('ru-RU')} ₽</Button>}
            {!community.user && <Button variant="outline" onClick={community.login}>Войти для участия</Button>}</div>
          <p className="pass-fine">Дополнительные награды сезона «{season.title}». Без автопродления. Общий XP для обеих дорожек. Plus приобретается отдельно.</p>
          {community.user && !ready.premium && <button className="pass-text-button" onClick={() => void action('check')} disabled={busy}>Проверить оплату</button>}
        </div>
        <div className="pass-finale"><div className="pass-final-label"><span>ФИНАЛЬНЫЙ КОМПЛЕКТ</span><b>УРОВЕНЬ 40</b></div><div className="pass-final-art">{ready.rewards.filter((r) => r.level === 40 && r.track === 'premium').map((r) => <button key={r.cosmetic_id} onClick={() => setSelected(r)} className={`pass-final-${r.kind}`} aria-label={`Посмотреть ${r.name}`}><img src={r.preview} alt={r.name} /></button>)}{!ready.rewards.some((r) => r.level === 40 && r.track === 'premium') && <div className="pass-unfilled"><Gift size={44} /><span>Финальный комплект ожидает загрузки</span><small>Пин · ONI AWAKENED · рамка · фон</small></div>}</div><p>ONI AWAKENED</p><small>Четыре предмета. Останутся с тобой после сезона.</small></div>
      </section>
      <section className="pass-rewards"><div className="pass-section-heading"><div><span className="pass-kicker">КОЛЛЕКЦИЯ СЕЗОНА</span><h2>Каждый уровень — новая история</h2></div><Button variant="outline" disabled={busy || !ready.rewards.some((r) => r.available && !r.claimed)} onClick={() => void action('claim')}><Gift size={16} /> Забрать всё</Button></div>
        <div className="pass-rail-nav"><span><i /> Бесплатно <i className="premium" /> Премиум</span><div><button aria-label="Предыдущие уровни" onClick={() => rail.current?.scrollBy({ left: -450, behavior: 'smooth' })}><ChevronLeft /></button><button aria-label="Следующие уровни" onClick={() => rail.current?.scrollBy({ left: 450, behavior: 'smooth' })}><ChevronRight /></button></div></div>
        <div ref={rail} className="pass-rail" aria-label="40 уровней наград">{Array.from({ length: 40 }, (_, i) => i + 1).map((level) => <div className={`pass-column ${level === Math.max(1, ready.level) ? 'current' : ''}`} data-level={level} key={level}><div className="pass-level-marker"><b>{level}</b><span>{level * 400} XP</span></div>{(['free','premium'] as const).map((track) => {
          const items = ready.rewards.filter((r) => r.level === level && r.track === track);
          return <div className={`pass-reward ${track} ${level > ready.level ? 'locked' : ''}`} key={track}><small>{track === 'free' ? 'БЕСПЛАТНО' : 'ПРЕМИУМ'}</small>{items.length ? <><div className="pass-item-images">{items.map((r) => <button key={r.cosmetic_id} onClick={() => setSelected(r)} aria-label={`Посмотреть награду ${r.name}`}><img src={r.preview} alt={r.name} loading="lazy" /></button>)}</div><strong>{items.length > 1 ? `Комплект · ${items.length} предмета` : items[0].name}</strong><span className="pass-reward-state">{items.every((r) => r.claimed) ? <><Check size={14} /> Получено</> : items.some((r) => r.available) ? <><Gift size={14} /> Можно забрать</> : <><Lock size={13} /> {level > ready.level ? `Нужен уровень ${level}` : 'Нужен премиум сезона'}</>}</span></> : <div className="pass-no-reward">{season.status === 'draft' ? 'Награда не назначена' : '—'}</div>}</div>;
        })}</div>)}</div>
      </section>
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
    <Dialog open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null); }}><DialogContent className="pass-reward-dialog"><DialogTitle>{selected?.name}</DialogTitle><DialogDescription>Уровень {selected?.level} · {selected?.track === 'premium' ? 'Премиальная' : 'Бесплатная'} дорожка. Оформление остаётся навсегда.</DialogDescription>{selected && <img className="pass-large-preview" src={selected.preview} alt={selected.name} />}{previewUser && <ProfileIdentity user={previewUser} preview />}{selected?.claimed ? <a className="hub-button" href="/profile?section=appearance">Применить в оформлении профиля →</a> : <p className="pass-fine">{previewUser ? 'Примерка: оформление профиля пока не изменено.' : 'Войдите, чтобы примерить награду на свой профиль.'}</p>}</DialogContent></Dialog>
  </main></div>;
}
