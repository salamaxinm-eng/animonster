import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { CommunityHeader } from '@/components/community/context';
import { base, viewer } from '@/lib/server/core';
import { feedbackResults } from '@/lib/server/demo-feedback';

export default async function PlayerFeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ offset?: string }>;
}) {
  const h = await headers(),
    user = await viewer(
      new Request(base(), { headers: { cookie: h.get('cookie') || '' } }),
    );
  if (user?.role !== 'admin') notFound();
  const requested = Number((await searchParams).offset || 0),
    offset =
      Number.isSafeInteger(requested) && requested >= 0 && requested <= 10000
        ? requested
        : 0;
  const data = await feedbackResults(offset);
  return (
    <div className="site-shell">
      <CommunityHeader />
      <main className="title-page">
        <Link href="/admin">← Админка</Link>
        <span className="eyebrow">ОБРАТНАЯ СВЯЗЬ / НОВЫЙ ПЛЕЕР</span>
        <h1>Впечатления зрителей</h1>
        <p className="muted">
          Форма доступна после просмотра минимум 70% каждой из трёх разных
          серий. Один отзыв на аккаунт или гостевой браузер.
        </p>
        <div className="dashboard-cards">
          <section className="social-panel">
            <span>Отзывов</span>
            <strong>{data.count}</strong>
          </section>
          <section className="social-panel">
            <span>Средняя оценка</span>
            <strong>
              {data.average === null
                ? '—'
                : data.average.toLocaleString('ru-RU', {
                    maximumFractionDigits: 1,
                  }) + ' / 10'}
            </strong>
          </section>
        </div>
        {data.items.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Зритель</th>
                  <th>Оценка</th>
                  <th>Комментарий</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item, index) => (
                  <tr key={offset + index}>
                    <td>
                      {new Date(item.submittedAt).toLocaleString('ru-RU', {
                        timeZone: 'Asia/Yekaterinburg',
                      })}
                    </td>
                    <td>{item.nick || 'Гость'}</td>
                    <td>{item.score} / 10</td>
                    <td
                      style={{
                        whiteSpace: 'pre-wrap',
                        overflowWrap: 'anywhere',
                        minWidth: 180,
                      }}
                    >
                      {item.comment || 'Без комментария'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <section className="social-panel">
            <p>
              Отзывов пока нет. Они появятся здесь после отправки зрителями.
            </p>
          </section>
        )}
        <nav aria-label="Страницы отзывов" className="demo-feedback-pagination">
          {offset > 0 && (
            <Link
              href={`/admin/player-feedback?offset=${Math.max(0, offset - 50)}`}
            >
              ← Предыдущие
            </Link>
          )}
          {data.hasMore && (
            <Link href={`/admin/player-feedback?offset=${offset + 50}`}>
              Следующие →
            </Link>
          )}
        </nav>
      </main>
    </div>
  );
}
