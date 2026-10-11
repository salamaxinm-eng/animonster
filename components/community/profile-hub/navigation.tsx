'use client';
import Link from 'next/link';
import {
  Activity,
  ArrowLeft,
  Award,
  Bookmark,
  Clock3,
  Crown,
  Home,
  LayoutGrid,
  Palette,
  Settings,
} from 'lucide-react';
import { sectionHref } from './shared';

export const sections = [
  ['overview', 'Обзор', Home],
  ['list', 'Список аниме', Bookmark],
  ['history', 'История просмотра', Clock3],
  ['collection', 'Коллекция', LayoutGrid],
  ['achievements', 'Достижения', Award],
  ['appearance', 'Оформление', Palette],
  ['activity', 'Активность', Activity],
  ['subscription', 'Подписка', Crown],
  ['settings', 'Настройки', Settings],
] as const;
export type Section = (typeof sections)[number][0];
export const shortcuts = [
  ['/vpn', 'VPN'],
  ['/downloads', 'Загрузки'],
  ['/bookmarks', 'Закладки'],
  ['/referrals', 'Пригласить друзей'],
  ['/founders', 'Founding 10'],
];
function SectionLinks({
  section,
  onNavigate,
}: {
  section: Section;
  onNavigate?: () => void;
}) {
  return (
    <>
      {sections.map(([id, label, Icon], index) => (
        <Link
          key={id}
          href={sectionHref(id)}
          className={`${section === id ? 'active' : ''} ${index === 7 ? 'hub-account-divider' : ''}`}
          aria-current={section === id ? 'page' : undefined}
          onClick={onNavigate}
        >
          <Icon size={19} aria-hidden="true" />
          {label}
        </Link>
      ))}
    </>
  );
}
export function HubNavigation({
  section,
  moderator,
  children,
}: {
  section: Section;
  moderator: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="hub-layout">
      <aside className="hub-sidebar">
        <nav aria-label="Разделы кабинета">
          <SectionLinks section={section} />
          <details className="hub-shortcuts">
            <summary>Другие возможности</summary>
            {shortcuts.map(([url, label]) => (
              <Link key={url} href={url}>
                {label}
              </Link>
            ))}
            {moderator && <Link href="/admin">Администрирование</Link>}
          </details>
        </nav>
      </aside>
      <main className="hub-main">
        <div className="hub-mobile-heading">
          {section === 'overview' ? (
            <span>Профиль</span>
          ) : (
            <Link href="/profile">
              <ArrowLeft size={20} aria-hidden="true" />
              Профиль
            </Link>
          )}
        </div>
        {section !== 'overview' && (
          <header className="hub-page-header">
            <h1>{sections.find(([id]) => id === section)?.[1]}</h1>
          </header>
        )}
        {children}
      </main>
    </div>
  );
}
