import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { viewer, isModerator, base } from '@/lib/server/core';
import { dashboard } from '@/lib/server/admin';
import { CommunityHeader } from '@/components/community/context';
export default async function Page() {
  const h = await headers(),
    u = await viewer(new Request(base() + '/admin', { headers: h }));
  if (!isModerator(u)) notFound();
  const d = await dashboard();
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
          Просмотр учитывается после 30 секунд воспроизведения, один раз для
          серии и зрителя за день.
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
                {d.daily.map((x) => (
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
      </main>
    </div>
  );
}
