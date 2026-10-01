import { CommunityHeader, Avatar, Pin } from '@/components/community/context';
import { headers } from 'next/headers';
import './founders.css';

export default async function FoundersPage() {
  const h = await headers();
  const host = h.get('host') || '';
  const local = process.env.NODE_ENV !== 'production' && /^localhost(?::\d+)?$/.test(host);
  const origin = local ? `http://${host}` : process.env.SITE_URL;
  if (!origin) throw new Error('SITE_URL is required');
  const response = await fetch(`${origin}/api/founders`, { cache: 'no-store' });
  if (!response.ok) throw new Error('Не удалось загрузить Founder-места');
  const { founders, remaining, backfillPending } = await response.json() as {
    founders: Array<{ founder_number: number; first_qualifying_payment_at: number; nick: string; avatar: string; pin: string }>;
    remaining: number | null;
    backfillPending: boolean;
  };
  const founderLabel = (n: number) => `#${String(n).padStart(3, '0')}`;
  const seats = Array.from({ length: 10 }, (_, index) =>
    founders.find((founder) => founder.founder_number === index + 1),
  );
  return <div className="social-site">
    <CommunityHeader />
    <main className="founders-page">
      <span className="eyebrow">ANIMONSTER / LEGACY</span>
      <h1>FOUNDING 10</h1>
      <p className="founders-lead">Первые 10 пользователей, поддержавших AniMonster донатом от 1000 ₽, получают эксклюзивный статус Founder.</p>
      <p>Один успешный донат должен составлять не менее 1000 ₽. Суммы нескольких донатов не складываются.</p>
      <p className="founders-remaining">{backfillPending ? 'Проверяем ранние платежи и закрепляем Founder-места.' : remaining ? `Осталось ${remaining} из 10 Founder-мест.` : 'Все 10 Founder-мест заняты.'}</p>
      <div className="founders-grid">
        {seats.map((founder, index) => <article className={`founder-seat ${founder ? 'occupied' : ''}`} key={index}>
          <span className="founder-seat-number">Founder {founderLabel(index + 1)}</span>
          {founder ? <>
            <Avatar avatar={founder.avatar} />
            <div><strong>{founder.nick}</strong><small>Дата вступления: {new Date(Number(founder.first_qualifying_payment_at)).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</small></div>
            <Pin id={founder.pin} />
          </> : <span className="founder-free">{backfillPending ? 'Проверяется' : 'Свободно'}</span>}
        </article>)}
      </div>
      {!backfillPending && remaining !== null && remaining > 0 && <p className="founders-invite">Станьте одним из первых 10 пользователей, поддержавших AniMonster донатом от 1000 ₽. <a href="/pins">Поддержать проект</a></p>}
    </main>
  </div>;
}
