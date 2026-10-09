'use client';

import { useEffect, useState } from 'react';
import { ArrowUpRight, CalendarDays, Heart, Play, Trophy } from 'lucide-react';
import { CommunityHeader } from '@/components/community/context';
import { SupportDonation } from '@/components/community/support-donation';
import { GoalRewardPreview } from '@/components/community/fundraising-choice';
import type { FundraisingGoal } from '@/lib/fundraising';
import './statistics.css';

type Leader = { id: string; nick: string; views: number };
type Supporter = { id: string; nick: string; amount: number; payments: number };
type Statistics = {
  goals: FundraisingGoal[];
  supporters: Supporter[];
  allTimeViews: Leader[];
  monthlyViews: Leader[];
};

const number = (value: number) => new Intl.NumberFormat('ru-RU').format(value);
const money = (value: number) => `${number(value)} ₽`;

function Leaderboard({
  title,
  description,
  rows,
  amount = false,
  monthly = false,
}: {
  title: string;
  description: string;
  rows: (Leader | Supporter)[];
  amount?: boolean;
  monthly?: boolean;
}) {
  return (
    <section className="stats-board" aria-label={title}>
      <div className="stats-board-heading">
        <div className={`stats-board-icon${amount ? ' stats-board-icon-heart' : ''}`}>
          {amount ? (
            <Heart size={22} />
          ) : monthly ? (
            <CalendarDays size={22} />
          ) : (
            <Play size={22} />
          )}
        </div>
        <div>
          <span className="stats-board-kicker">ТОП 10</span>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      {rows.length ? (
        <table className="stats-table">
          <thead>
            <tr>
              <th scope="col">Место</th>
              <th scope="col">Участник</th>
              <th scope="col">{amount ? 'Поддержка' : 'Серии'}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.id}>
                <td>
                  <span className={`stats-rank${index < 3 ? ' stats-rank-top' : ''}`}>
                    {index + 1}
                  </span>
                </td>
                <td>
                  <a
                    className="stats-user"
                    href={`/members/${encodeURIComponent(row.id)}`}
                  >
                    <span className="stats-user-avatar" aria-hidden="true">
                      {row.nick.slice(0, 1).toUpperCase()}
                    </span>
                    <span>{row.nick}</span>
                    <ArrowUpRight size={14} aria-hidden="true" />
                  </a>
                </td>
                <td className="stats-value">
                  {amount
                    ? money((row as Supporter).amount)
                    : number((row as Leader).views)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="stats-empty">Пока никто не занял место в рейтинге.</div>
      )}
    </section>
  );
}

export default function StatisticsPage() {
  const [stats, setStats] = useState<Statistics | null>(null);
  const [error, setError] = useState('');
  const [goalSlug, setGoalSlug] = useState('player');

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch('/api/statistics', { cache: 'no-store' });
        if (!response.ok) throw new Error('Статистика временно недоступна');
        const result = (await response.json()) as Statistics;
        if (active) {
          setStats(result);
          setError('');
        }
      } catch {
        if (active) setError('Не удалось обновить статистику. Попробуйте позже.');
      }
    }
    void load();
    const timer = setInterval(() => void load(), 60_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const selectedGoal = stats?.goals.find((goal) => goal.slug === goalSlug) || stats?.goals[0];
  const goal = selectedGoal?.targetAmount ?? 0;
  const raised = selectedGoal?.raised ?? 0;
  const percent = selectedGoal?.percent ?? 0;
  const remaining = selectedGoal?.remaining ?? 0;

  return (
    <div className="social-site stats-site">
      <CommunityHeader />
      <main className="stats-page">
        <div className="stats-intro">
          <span className="stats-eyebrow">
            <Trophy size={16} /> СООБЩЕСТВО ANIMONSTER
          </span>
          <h1>
            Статистика <em>сообщества</em>
          </h1>
          <p>
            Люди, которые поддерживают проект и открывают новые истории каждый
            день.
          </p>
        </div>

        <section className="stats-fund" aria-labelledby="stats-fund-title">
          <div className="stats-fund-copy">
            <span className="stats-fund-kicker">
              <span className="stats-live-dot" /> НАША ЦЕЛЬ
            </span>
            <div className="fundraising-goal-switch" role="group" aria-label="Сборы AniMonster">
              {stats?.goals.map((item) => <button type="button" key={item.id}
                aria-pressed={selectedGoal?.id === item.id} onClick={() => setGoalSlug(item.slug)}>{item.shortTitle}</button>)}
            </div>
            <h2 id="stats-fund-title">{selectedGoal?.title || 'Загружаем цель…'}</h2>
            <p>{selectedGoal?.description}</p>
            {selectedGoal?.rewards.length ? <div className="stats-fund-reward">
              <p>За поддержку — эксклюзивный набор для профиля. Донат от 150 ₽.</p>
              <GoalRewardPreview goal={selectedGoal} compact />
            </div> : null}
            {selectedGoal && <SupportDonation initialGoalSlug={selectedGoal.slug} disabled={!selectedGoal.isActive} />}
            {selectedGoal && !selectedGoal.isActive && <p className="stats-remaining">Сбор завершён. Полученные награды остаются у вас.</p>}
          </div>
          <div className="stats-fund-progress">
            <div className="stats-progress-top">
              <span>Собрано</span>
              <strong>{selectedGoal ? money(raised) : 'Загружаем…'}</strong>
            </div>
            <div
              className="stats-meter"
              role="progressbar"
              aria-label={selectedGoal?.title || 'Сбор AniMonster'}
              aria-valuemin={0}
              aria-valuemax={goal}
              aria-valuenow={Math.min(raised, goal)}
            >
              <div className="stats-meter-fill" style={{ width: `${percent}%` }} />
            </div>
            <div className="stats-progress-bottom">
              <span>{selectedGoal ? `${Math.round(percent)}% цели` : 'Обновляем данные'}</span>
              <span>{selectedGoal ? `${money(goal)} цель` : '—'}</span>
            </div>
            <p className="stats-remaining">
              {selectedGoal
                ? remaining > 0
                  ? `Осталось собрать ${money(remaining)}`
                  : 'Цель достигнута! Спасибо за поддержку.'
                : 'Сумма обновляется автоматически.'}
            </p>
          </div>
        </section>

        {error && (
          <p className="stats-error" role="alert">
            {error}
          </p>
        )}
        {!stats && !error && (
          <p className="stats-loading" role="status">
            Загружаем рейтинги…
          </p>
        )}
        {stats && (
          <>
            <div className="stats-section-heading">
              <span>НАШИ ЛИДЕРЫ</span>
              <h2>Три рейтинга. Десять мест в каждом.</h2>
            </div>
            <div className="stats-boards">
              <Leaderboard
                title="Топ донатеров"
                description="Все реальные успешные платежи, включая Plus."
                rows={stats.supporters}
                amount
              />
              <Leaderboard
                title="Топ по просмотрам"
                description="Впервые просмотренные серии за всё время."
                rows={stats.allTimeViews}
              />
              <Leaderboard
                title="Топ за 30 дней"
                description="Впервые просмотренные серии за последние 30 дней."
                rows={stats.monthlyViews}
                monthly
              />
            </div>
            <p className="stats-method">
              Серия засчитывается пользователю один раз после 12 минут
              просмотра. Старые просмотренные серии входят в общий топ; рейтинг
              за 30 дней ведётся с запуска этой статистики. Тестовые оплаты
              исключены.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
