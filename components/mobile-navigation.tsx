'use client';

import { Suspense, useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  Bookmark,
  Ghost,
  Home,
  LayoutGrid,
  Search,
  UserRound,
} from 'lucide-react';
import { BuySubscription } from '@/components/community/buy-subscription';
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
    href: '/profile?section=list',
    label: 'Мой список',
    icon: Bookmark,
    active: (path) => path === '/profile?section=list',
  },
  {
    href: '/profile',
    label: 'Профиль',
    icon: UserRound,
    active: (path) =>
      path === '/profile' || path.startsWith('/members/') || path === '/pins',
    account: true,
  },
];

export function MobileNavigation() {
  return (
    <Suspense fallback={null}>
      <MobileNavigationContent />
    </Suspense>
  );
}

function MobileNavigationContent() {
  const pathname = usePathname();
  const params = useSearchParams();
  const activePath =
    pathname === '/profile' &&
    (params.get('section') === 'list' ||
      (!params.get('section') && params.get('tab') === 'collection'))
      ? '/profile?section=list'
      : pathname;
  const community = useCommunity();
  const [hash, setHash] = useState('');
  const sectionTitle =
    pathname === '/bookmarks'
      ? 'Закладки'
      : pathname === '/vpn'
        ? 'VPN'
        : pathname === '/statistics'
          ? 'Статистика'
          : pathname.startsWith('/downloads')
            ? 'Загрузки'
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
        <div className="mobile-topbar-actions">
          <BuySubscription compact className="mobile-plus-button" />
          <a
            className="mobile-search-button"
            href="/search"
            aria-label="Поиск аниме"
          >
            <Search aria-hidden="true" />
          </a>
        </div>
      </header>
      {pathname === '/profile' && (
        <nav className="mobile-legal" aria-label="Юридическая информация">
          <a href="/legal/privacy">Конфиденциальность</a>
          <a href="/legal/terms">Пользовательское соглашение</a>
          <a href="/legal/prices">Цены и тарифы</a>
          <a href="/legal/support">Поддержка</a>
          <a href="/legal/rules">Правила</a>
          <a href="/legal/offer">Оферта</a>
          <a href="/legal/requisites">Реквизиты</a>
        </nav>
      )}
      <nav className="mobile-bottom-nav" aria-label="Навигация">
        {items.map((item) => {
          const Icon = item.icon;
          const active =
            item.active(activePath, hash) &&
            !(item.account && activePath === '/profile?section=list');
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
