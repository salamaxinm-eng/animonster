import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { CommunityHeader } from '@/components/community/context';
import { AdminTools } from '@/components/community/admin-tools';
export default async function Page() {
  const h = await headers();
  const host = h.get('host');
  if (!host) notFound();
  const origin = process.env.SITE_URL || `${host.startsWith('localhost') ? 'http' : 'https'}://${host}`;
  const response = await fetch(`${origin}/api/admin`, {
    cache: 'no-store', headers: { cookie: h.get('cookie') || '' },
  }).catch(() => null);
  if (!response) notFound();
  if (!response.ok) notFound();
  const { dashboard: d } = await response.json();
  const metrics: [string, number][] = [
    ['DAU · сегодня', d.dau],
    ['MAU · 30 дней', d.mau],
    ['Активны сейчас · 15 мин', d.activeSessions],
    ['Аккаунты', d.users],
    ['Регистрации · 7 дней', d.signups7d],
    ['Регистрации · 30 дней', d.signups30d],
    ['Активный AniMonster Plus', d.premiumUsers],
    ['Просмотры · 7 дней', d.views7d],
    ['Просмотры · 30 дней', d.views30d],
    ['Просмотры · всего', d.views],
    ['Просмотрено серий', d.completedEpisodes],
    ['Часы просмотра', d.watchHours],
    ['Записей в истории', d.trackedEpisodes],
    ['Избранное', d.favorites],
    ['Комментарии · 30 дней', d.comments30d],
    ['Жалобы на проверке', d.openReports],
    ['Тайтлы в каталоге', d.catalogTitles],
    ['Готовые рекомендации', d.recommendationCount],
    ['Пользователи с рекомендациями', d.recommendationUsers],
  ];
  return (
    <div className="social-site">
      <CommunityHeader />
      <main className="title-page">
        <span className="eyebrow">ANIMONSTER / УПРАВЛЕНИЕ</span>
        <h1>Пульс сообщества</h1>
        <div className="dashboard-cards">
          {metrics.map(([label, value]) => (
            <section className="social-panel" key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </section>
          ))}
        </div>
        <p className="muted">
          Активность — уникальные аккаунты и гостевые браузеры, дни по UTC.
          Просмотр в статистике учитывается после 30 секунд воспроизведения,
          один раз для серии и зрителя за день. В профиле серия считается
          просмотренной после 12 минут фактического просмотра.
        </p>
        <section className="social-panel">
          <h2>Активность за 30 дней</h2>
          {d.daily.length ? (
            <div className="admin-table-wrap">
              <table className="admin-table">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Просмотры</th>
                  <th>Активные зрители</th>
                </tr>
              </thead>
              <tbody>
                {d.daily.map((x: { day: string; views: number; active: number }) => (
                  <tr key={String(x.day)}>
                    <td>{String(x.day)}</td>
                    <td>{Number(x.views)}</td>
                    <td>{Number(x.active)}</td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
          ) : (
            <p>Просмотров пока нет.</p>
          )}
        </section>
        <section className="social-panel">
          <h2>Популярные тайтлы · 30 дней</h2>
          {d.topAnime.length ? (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr><th>Аниме</th><th>Просмотры</th></tr>
                </thead>
                <tbody>
                  {d.topAnime.map((item: { id: number; title: string; views: number }) => (
                    <tr key={item.id}>
                      <td><a href={`/anime/${item.id}`}>{item.title}</a></td>
                      <td>{item.views}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p>Данных о просмотрах пока нет.</p>}
        </section>
        <section className="social-panel">
          <h2>Состояние источников</h2>
          {d.providers.length ? (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr><th>Источник</th><th>Статус</th><th>Задержка</th><th>Последняя проверка</th></tr>
                </thead>
                <tbody>
                  {d.providers.map((item: { provider: string; status: string; latency_ms: number | null; error: string | null; checked_at: number }) => (
                    <tr key={item.provider}>
                      <td>{item.provider}</td>
                      <td>{item.status}{item.error ? <small>{item.error}</small> : null}</td>
                      <td>{item.latency_ms == null ? '—' : `${item.latency_ms} мс`}</td>
                      <td>{new Date(item.checked_at).toLocaleString('ru-RU', { timeZone: 'UTC' })} UTC</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p>Проверки источников пока не записывались.</p>}
        </section>
        <a href="/profile?tab=moderation">Проверить жалобы →</a>
        <AdminTools />
      </main>
    </div>
  );
}
