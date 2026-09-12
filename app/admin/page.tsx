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
  return (
    <div className="social-site">
      <CommunityHeader />
      <main className="title-page">
        <span className="eyebrow">ANIMONSTER / УПРАВЛЕНИЕ</span>
        <h1>Пульс сообщества</h1>
        <div className="dashboard-cards">
          {[
            ['DAU', d.dau],
            ['MAU · 30 дней', d.mau],
            ['Просмотры серий', d.views],
            ['Аккаунты', d.users],
          ].map(([label, value]) => (
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
          <h2>Просмотры за 30 дней</h2>
          {d.daily.length ? (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Просмотры</th>
                </tr>
              </thead>
              <tbody>
                {d.daily.map((x: { day: string; n: number }) => (
                  <tr key={String(x.day)}>
                    <td>{String(x.day)}</td>
                    <td>{Number(x.n)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>Просмотров пока нет.</p>
          )}
        </section>
        <a href="/profile?tab=moderation">Проверить жалобы →</a>
        <AdminTools />
      </main>
    </div>
  );
}
