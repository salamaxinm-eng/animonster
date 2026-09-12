'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  Bookmark,
  Ghost,
  Home,
  LayoutGrid,
  Search,
  UserRound,
} from 'lucide-react';
import { useCommunity } from '@/components/community/context';

type MobileNavItem = {
  href: string;
  label: string;
  icon: typeof Home;
  active: (pathname: string, hash: string) => boolean;
  account?: boolean;
};

const items: MobileNavItem[] = [
  {
    href: '/',
    label: 'Главная',
    icon: Home,
    active: (path, hash) => path === '/' && hash !== '#catalog',
  },
  {
    href: '/bookmarks',
    label: 'Закладки',
    icon: Bookmark,
    active: (path) => path === '/bookmarks',
  },
  {
    href: '/catalog',
    label: 'Каталог',
    icon: LayoutGrid,
    active: (path, hash) =>
      path === '/genres' ||
      path.startsWith('/genres/') ||
      path.startsWith('/anime/') ||
      path.startsWith('/browse/') ||
      path === '/catalog' ||
      path === '/recommendations' ||
      (path === '/' && hash === '#catalog'),
  },
  {
    href: '/profile',
    label: 'Аккаунт',
    icon: UserRound,
    active: (path) =>
      path === '/profile' || path.startsWith('/members/') || path === '/pins',
    account: true,
  },
];

export function MobileNavigation() {
  const pathname = usePathname();
  const community = useCommunity();
  const [hash, setHash] = useState('');
  const sectionTitle =
    pathname === '/bookmarks'
      ? 'Закладки'
      : pathname === '/catalog' || pathname === '/genres'
        ? 'Каталог'
        : '';

  useEffect(() => {
    const update = () => setHash(location.hash);
    update();
    addEventListener('hashchange', update);
    return () => removeEventListener('hashchange', update);
  }, [pathname]);

  if (
    pathname === '/admin' ||
    pathname === '/search' ||
    pathname.startsWith('/legal/') ||
    pathname === '/reset-password'
  )
    return null;

  return (
    <>
      <header className="mobile-topbar">
        {sectionTitle ? (
          <strong className="mobile-page-heading">{sectionTitle}</strong>
        ) : (
          <a
            className="mobile-brand"
            href="/"
            aria-label="AniMonster — главная"
          >
            <Ghost aria-hidden="true" fill="currentColor" />
            <span>
              Ani<strong>Monster</strong>
            </span>
          </a>
        )}
        <a
          className="mobile-search-button"
          href="/search"
          aria-label="Поиск аниме"
        >
          <Search aria-hidden="true" />
        </a>
      </header>
      {pathname === '/profile' && (
        <nav className="mobile-legal" aria-label="Юридическая информация">
          <a href="/legal/privacy">Конфиденциальность</a>
          <a href="/legal/terms">Условия</a>
          <a href="/legal/rules">Правила</a>
        </nav>
      )}
      <nav className="mobile-bottom-nav" aria-label="Навигация">
        {items.map((item) => {
          const Icon = item.icon;
          const active = item.active(pathname, hash);
          if (item.account && !community.user) {
            return (
              <button
                key={item.label}
                onClick={community.login}
                aria-label={item.label}
              >
                <Icon aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          }
          return (
            <a
              key={item.label}
              href={item.href}
              className={active ? 'active' : ''}
              aria-current={active ? 'page' : undefined}
            >
              <Icon aria-hidden="true" />
              <span>{item.label}</span>
            </a>
          );
        })}
      </nav>
    </>
  );
}
