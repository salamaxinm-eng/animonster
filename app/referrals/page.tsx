'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Lock, Share2, Users } from 'lucide-react';
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
    await navigator.clipboard.writeText(data.url);
    setNotice('Ссылка скопирована');
  }
  async function share() {
    if (!data) return;
    if (navigator.share)
      await navigator.share({
        title: 'AniMonster',
        text: 'Смотри аниме вместе со мной на AniMonster',
        url: data.url,
      });
    else await copy();
  }
  return (
    <div className="social-site referrals-page">
      <CommunityHeader />
      <main>
        <section className="referral-hero">
          <span>ПРОГРАММА ANIMONSTER</span>
          <h1>Приглашай друзей — прокачивай AniMonster</h1>
          <p>
            Получай редкие теги, пины, рамки и Plus за друзей, которые реально
            смотрят аниме.
          </p>
        </section>
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
                <strong>{data.url}</strong>
                <div>
                  <button onClick={() => void copy()}>
                    <Copy /> Copy
                  </button>
                  <button onClick={() => void share()}>
                    <Share2 /> Share
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
            {notice && <p className="success-msg">{notice}</p>}
            <section className="referral-progress" aria-label="Этапы наград">
              {milestones.map((item) => (
                <div
                  className={
                    data.qualified >= item.count
                      ? 'done'
                      : item === next
                        ? 'next'
                        : ''
                  }
                  key={item.count}
                >
                  <span>
                    {data.qualified >= item.count ? <Check /> : item.count}
                  </span>
                  <strong>{item.title}</strong>
                </div>
              ))}
            </section>
            <section className="referral-rewards">
              {milestones.map((item) => (
                <article
                  className={
                    data.qualified >= item.count
                      ? 'unlocked'
                      : item === next
                        ? 'next'
                        : ''
                  }
                  key={item.count}
                >
                  {data.qualified >= item.count ? <Check /> : <Lock />}
                  <small>
                    {item.count} {item.count === 1 ? 'друг' : 'друзей'}
                  </small>
                  <h2>{item.title}</h2>
                  <p>{item.detail}</p>
                  <span>
                    {data.qualified >= item.count
                      ? 'Получено'
                      : item === next
                        ? 'Следующая награда'
                        : 'Заблокировано'}
                  </span>
                </article>
              ))}
            </section>
            <p className="referral-rule">
              Друг засчитывается после регистрации и 60 минут просмотра.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
