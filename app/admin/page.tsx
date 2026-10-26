import { UserNickname } from '@/components/user-nickname';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { CommunityHeader } from '@/components/community/context';
import { AdminWorkspace } from '@/components/community/admin-workspace';
export default async function Page() {
  const h = await headers();
  const host = h.get('host') || '';
  const local =
    process.env.NODE_ENV !== 'production' && /^localhost(?::\d+)?$/.test(host);
  const origin = local ? `http://${host}` : process.env.SITE_URL;
  if (!origin) notFound();
  const response = await fetch(`${origin}/api/admin`, {
    cache: 'no-store',
    headers: { cookie: h.get('cookie') || '' },
  });
  if (
    response.status === 401 ||
    response.status === 403 ||
    response.status === 404
  )
    notFound();
  if (!response.ok)
    throw new Error('Не удалось загрузить статистику администратора');
  const data = await response.json();
  const d = data.dashboard;
  const metrics: [string, number][] = [
    ['Серий ≥12 мин · сегодня', d.completedToday],
    ['Запусков ≥30 сек · сегодня', d.viewsToday],
    ['Часов · сегодня', d.watchHoursToday],
    ['Зрителей · сегодня', d.dau],
    ['MAU · 30 дней', d.mau],
    ['Регистрации · 7 дней', d.signups7d],
    ['Активный AniMonster Plus', d.premiumUsers],
    ['Запуски ≥30 сек · 30 дней', d.views30d],
    ['Успешные оплаты · 30 дней', d.paidOrders30d],
    ['Оплаты в ожидании более часа · 30 дней', d.pendingOrders30d],
    ['Жалобы на проверке', d.openReports],
  ];
  return (
    <div className="site-shell">
      <CommunityHeader />
      <main className="title-page admin-page">
        <span className="eyebrow">ANIMONSTER / УПРАВЛЕНИЕ</span>
        <h1>Пульс сообщества</h1>
        <AdminWorkspace data={data}>
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
            Запуск — от 30 секунд, просмотренная серия — от 12 минут за день,
            один раз для серии и зрителя. Учитываются обычный плеер, Kodik,
            совместный просмотр и новый демоплеер при подключении к сайту. Гость
            и вошедший аккаунт — разные зрители. Просмотр офлайн не учитывается.
            Точный дневной учёт минут и серий включён{' '}
            {new Date(d.dailyTrackingSince).toLocaleString('ru-RU', {
              timeZone: 'UTC',
            })}{' '}
            UTC; более ранние дни содержат только прежние запуски. В профиле
            порог 12 минут накопительный.
          </p>
          <details className="social-panel">
            <summary>Активность за 30 дней — по дням</summary>
            {d.daily.length ? (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Дата</th>
                      <th>Запуски ≥30 сек</th>
                      <th>Серии ≥12 мин</th>
                      <th>Часов</th>
                      <th>Активные зрители</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.daily.map(
                      (x: {
                        day: string;
                        views: number;
                        active: number;
                        completed: number;
                        hours: number;
                      }) => (
                        <tr key={String(x.day)}>
                          <td>{String(x.day)}</td>
                          <td>{Number(x.views)}</td>
                          <td>
                            {x.day <
                            new Date(d.dailyTrackingSince)
                              .toISOString()
                              .slice(0, 10)
                              ? '—'
                              : Number(x.completed)}
                          </td>
                          <td>
                            {x.day <
                            new Date(d.dailyTrackingSince)
                              .toISOString()
                              .slice(0, 10)
                              ? '—'
                              : Number(x.hours)}
                          </td>
                          <td>{Number(x.active)}</td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>Просмотров пока нет.</p>
            )}
          </details>
          <details className="social-panel">
            <summary>Популярные тайтлы · 30 дней</summary>
            {d.topAnime.length ? (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Аниме</th>
                      <th>Запуски ≥30 сек</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.topAnime.map(
                      (item: { id: number; title: string; views: number }) => (
                        <tr key={item.id}>
                          <td>
                            <a href={`/anime/${item.id}`}>{item.title}</a>
                          </td>
                          <td>{item.views}</td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>Данных о просмотрах пока нет.</p>
            )}
          </details>
          <details className="social-panel">
            <summary>Топ-10 по активности</summary>
            <p className="muted">
              Накопительный итог: от 12 минут на серию. Это не обязательно
              просмотр до конца.
            </p>
            {d.topUsers.length ? (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Место</th>
                      <th>Пользователь</th>
                      <th>Просмотрено серий</th>
                      <th>Начато серий</th>
                      <th>Часов просмотра</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.topUsers.map(
                      (
                        item: {
                          id: string;
                          nick: string;
                          watchedEpisodes: number;
                          trackedEpisodes: number;
                          watchedHours: number;
                        },
                        index: number,
                      ) => (
                        <tr key={item.id}>
                          <td>{index + 1}</td>
                          <td>
                            <a href={`/members/${item.id}`}><UserNickname user={item}/></a>
                          </td>
                          <td>{item.watchedEpisodes}</td>
                          <td>{item.trackedEpisodes}</td>
                          <td>{item.watchedHours.toLocaleString('ru-RU')}</td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>Данных о просмотренных сериях пока нет.</p>
            )}
          </details>
          <details className="social-panel">
            <summary>Состояние источников</summary>
            {d.providers.length ? (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Источник</th>
                      <th>Статус</th>
                      <th>Задержка</th>
                      <th>Последняя проверка</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.providers.map(
                      (item: {
                        provider: string;
                        status: string;
                        latency_ms: number | null;
                        error: string | null;
                        checked_at: number;
                      }) => (
                        <tr key={item.provider}>
                          <td>{item.provider}</td>
                          <td>
                            {item.status}
                            {item.error ? <small>{item.error}</small> : null}
                          </td>
                          <td>
                            {item.latency_ms == null
                              ? '—'
                              : `${item.latency_ms} мс`}
                          </td>
                          <td>
                            {new Date(item.checked_at).toLocaleString('ru-RU', {
                              timeZone: 'UTC',
                            })}{' '}
                            UTC
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>Проверки источников пока не записывались.</p>
            )}
          </details>
        </AdminWorkspace>
      </main>
    </div>
  );
}
