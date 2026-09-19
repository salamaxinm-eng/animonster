'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Check,
  Copy,
  Crown,
  Gift,
  Ghost,
  Lock,
  Play,
  Share2,
  Sparkles,
  Users,
} from 'lucide-react';
import './referrals.css';
import { CommunityHeader, useCommunity } from '@/components/community/context';

type Dashboard = {
  code: string;
  url: string;
  registered: number;
  qualified: number;
  friends: { nick: string; status: string }[];
};
const milestones = [
  { count: 1, title: 'Вербовщик', detail: 'Эксклюзивный тег' },
  { count: 3, title: 'Искатель', detail: 'Редкий pixel pin' },
  { count: 5, title: 'Команда', detail: 'Pixel pin и 7 дней Plus' },
  { count: 10, title: 'Капитан', detail: 'Рамка и эксклюзивный pin' },
  { count: 25, title: 'Легенда', detail: 'Тег, legendary pin и 30 дней Plus' },
];

export default function ReferralsPage() {
  const community = useCommunity();
  const [data, setData] = useState<Dashboard | null>(null);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (!community.user) return;
    fetch('/api/referrals')
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then(setData)
      .catch(() => setNotice('Не удалось загрузить реферальную программу'));
  }, [community.user?.id]);
  const next = useMemo(
    () => milestones.find((item) => item.count > (data?.qualified || 0)),
    [data?.qualified],
  );
  async function copy() {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.url);
      setNotice('Ссылка скопирована — отправь её друзьям');
    } catch {
      setNotice('Выдели и скопируй ссылку вручную');
    }
  }
  async function share() {
    if (!data) return;
    try {
      if (navigator.share)
        await navigator.share({
          title: 'AniMonster',
          text: 'Смотри аниме вместе со мной на AniMonster',
          url: data.url,
        });
      else await copy();
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError'))
        setNotice('Не удалось поделиться. Попробуй скопировать ссылку.');
    }
  }
  return (
    <div className="social-site referrals-page">
      <CommunityHeader />
      <main>
        <section className="referral-hero">
          <div className="referral-hero-copy">
            <span className="referral-eyebrow">
              <Sparkles size={14} /> СВОИ ЛЮДИ. РЕДКИЕ НАГРАДЫ.
            </span>
            <h1>
              Аниме лучше
              <br />в <em>твоей компании.</em>
            </h1>
            <p>
              Получай редкие теги, пины, рамки и Plus за друзей, которые реально
              смотрят аниме.
            </p>
            <a className="referral-hero-cta" href="#invite">
              <Users size={18} /> Пригласить друзей <ArrowUpRight size={18} />
            </a>
            <div className="referral-hero-perks">
              <span>
                <Gift size={15} /> Косметика навсегда
              </span>
              <span>
                <Crown size={15} /> До 37 дней Plus
              </span>
            </div>
          </div>
          <div
            className="referral-showcase"
            aria-label="Пример оформления профиля"
          >
            <span className="referral-showcase-caption">
              ТВОЙ ПРОФИЛЬ. ТВОЯ ИСТОРИЯ.
            </span>
            <div className="referral-orbit">
              <Ghost size={74} strokeWidth={1.3} />
              <span className="referral-orbit-pin">
                <img src="/pins/referral-legend.svg" alt="Легендарный пин" />
              </span>
            </div>
            <strong>{community.user?.nick || 'Твой ник'}</strong>
            <span className="referral-demo-tag">
              <Sparkles size={13} /> Легенда AniMonster
            </span>
            <small>Оформление за 25 друзей</small>
            <div className="referral-mini-loot">
              <span>
                <img src="/pins/referral-scout.svg" alt="" /> Пины
              </span>
              <span>
                <Crown size={20} /> Рамки
              </span>
              <span>
                <Gift size={20} /> Теги
              </span>
            </div>
          </div>
        </section>
        <div id="invite" className="referral-invite-anchor" />
        {!community.loaded ? (
          <p>Загрузка…</p>
        ) : !community.user ? (
          <section className="referral-login-card">
            <h2>Войди, чтобы получить постоянную ссылку</h2>
            <button onClick={community.login}>Войти</button>
          </section>
        ) : !data ? (
          <p>{notice || 'Готовим твою ссылку…'}</p>
        ) : (
          <>
            <section className="referral-summary">
              <div className="referral-link-box">
                <small>Твоя реферальная ссылка</small>
                <input
                  aria-label="Твоя реферальная ссылка"
                  readOnly
                  value={data.url}
                  onFocus={(event) => event.currentTarget.select()}
                />
                <div>
                  <button onClick={() => void copy()}>
                    <Copy /> Скопировать
                  </button>
                  <button onClick={() => void share()}>
                    <Share2 /> Поделиться
                  </button>
                </div>
              </div>
              <div>
                <Users />
                <strong>{data.registered}</strong>
                <span>зарегистрировано</span>
              </div>
              <div>
                <Check />
                <strong>{data.qualified}</strong>
                <span>засчитано</span>
              </div>
              <div>
                <strong>{next ? next.count - data.qualified : 0}</strong>
                <span>до следующей награды</span>
              </div>
            </section>
            {notice && (
              <p className="success-msg" role="status">
                {notice}
              </p>
            )}
          </>
        )}
        <div className="referral-section-title">
          <div>
            <span className="referral-eyebrow">КОЛЛЕКЦИЯ ЗА ДРУЗЕЙ</span>
            <h2>
              Каждый новый друг —<br />
              ещё одна редкость.
            </h2>
          </div>
          <a href="/profile?tab=rewards">
            Мои награды <ArrowUpRight size={16} />
          </a>
        </div>
        <section className="referral-progress" aria-label="Этапы наград">
          {milestones.map((item) => (
            <div
              className={
                (data?.qualified || 0) >= item.count
                  ? 'done'
                  : item === next
                    ? 'next'
                    : ''
              }
              key={item.count}
            >
              <span>
                {(data?.qualified || 0) >= item.count ? <Check /> : item.count}
              </span>
              <strong>{item.title}</strong>
            </div>
          ))}
        </section>
        <section className="referral-rewards">
          {milestones.map((item) => (
            <article
              className={
                (data?.qualified || 0) >= item.count
                  ? 'unlocked'
                  : item === next
                    ? 'next'
                    : ''
              }
              key={item.count}
            >
              <div className={'referral-loot-art loot-' + item.count}>
                {item.count === 1 ? (
                  <span className="referral-demo-tag">
                    <Users size={16} /> Вербовщик
                  </span>
                ) : (
                  <img
                    src={
                      '/pins/referral-' +
                      ({ 3: 'scout', 5: 'crew', 10: 'master', 25: 'legend' }[
                        item.count
                      ] || 'scout') +
                      '.svg'
                    }
                    alt={item.title}
                  />
                )}
                {(item.count === 5 || item.count === 25) && (
                  <span className="referral-days">
                    <Crown size={12} /> {item.count === 5 ? '+7' : '+30'} дней
                    Plus
                  </span>
                )}
              </div>
              <small>
                {item.count} {item.count === 1 ? 'друг' : 'друзей'}
              </small>
              <h2>{item.title}</h2>
              <p>{item.detail}</p>
              <span>
                {(data?.qualified || 0) >= item.count ? (
                  <>
                    <Check size={13} /> Получено
                  </>
                ) : item === next ? (
                  'Следующая награда'
                ) : (
                  <>
                    <Lock size={12} /> Заблокировано
                  </>
                )}
              </span>
            </article>
          ))}
        </section>
        <section className="referral-how">
          <div>
            <Share2 />
            <strong>01. Поделись ссылкой</strong>
            <p>Отправь её другу, с которым обсуждаешь любимые истории.</p>
          </div>
          <div>
            <Play />
            <strong>02. Смотрите вместе</strong>
            <p>Друг засчитывается после регистрации и 60 минут просмотра.</p>
          </div>
          <div>
            <Gift />
            <strong>03. Забирай награды</strong>
            <p>
              Тебе — редкая косметика и Plus. Другу — 3 дня Plus после
              просмотра.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
