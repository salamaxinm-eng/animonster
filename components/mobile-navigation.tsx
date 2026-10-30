'use client';

import {
  HalloweenNavIcon,
  type HalloweenNavKind,
} from '@/components/halloween-nav-icon';
import { SeasonalBrand } from '@/components/halloween';
import {
  Suspense,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { PhotoSearchButton } from '@/components/photo-search-button';
import {
  Bookmark,
  Home,
  LayoutGrid,
  Search,
  Swords,
  UserRound,
} from 'lucide-react';
import { MobileProfileMenu } from '@/components/community/mobile-profile-menu';
import { BuySubscription } from '@/components/community/buy-subscription';
import { useCommunity } from '@/components/community/context';
import { usePassAccess } from '@/components/pass-cosmetics';
import { useMobileNavigationVisibility } from '@/hooks/use-mobile-navigation-visibility';

type MobileNavItem = {
  href: string;
  label: string;
  icon: typeof Home;
  halloweenIcon: HalloweenNavKind;
  active: (pathname: string, hash: string) => boolean;
  account?: boolean;
};

const items: MobileNavItem[] = [
  {
    href: '/',
    label: 'Главная',
    icon: Home,
    halloweenIcon: 'home',
    active: (path, hash) => path === '/' && hash !== '#catalog',
  },
  {
    href: '/catalog',
    label: 'Каталог',
    icon: LayoutGrid,
    halloweenIcon: 'catalog',
    active: (path, hash) =>
      path === '/genres' ||
      path === '/themes' ||
      path.startsWith('/genres/') ||
      path.startsWith('/themes/') ||
      path.startsWith('/anime/') ||
      path.startsWith('/browse/') ||
      path === '/catalog' ||
      path === '/recommendations' ||
      (path === '/' && hash === '#catalog'),
  },
  {
    href: '/battlepass',
    label: 'Пропуск',
    icon: Swords,
    halloweenIcon: 'pass',
    active: (path) => path === '/battlepass',
  },
  {
    href: '/profile?section=list',
    label: 'Мой список',
    icon: Bookmark,
    halloweenIcon: 'list',
    active: (path) => path === '/profile?section=list',
  },
  {
    href: '/profile',
    label: 'Профиль',
    icon: UserRound,
    halloweenIcon: 'profile',
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
  const passVisible = usePassAccess();
  const [hash, setHash] = useState('');
  const nav = useRef<HTMLElement>(null);
  const hidden = useMobileNavigationVisibility(
    pathname + '?' + params.toString() + hash,
    nav,
  );
  const visibleItems = items.filter(
    (item) => item.href !== '/battlepass' || passVisible,
  );
  const activeIndex = visibleItems.findIndex((item) =>
    item.active(activePath, hash),
  );
  const sectionTitle =
    pathname === '/bookmarks'
      ? 'Закладки'
      : pathname === '/vpn'
        ? 'VPN'
        : pathname === '/statistics'
          ? 'Статистика'
          : pathname.startsWith('/downloads')
            ? 'Загрузки'
            : pathname === '/catalog' ||
                pathname === '/genres' ||
                pathname === '/themes'
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
          <SeasonalBrand mobile />
        )}
        <div className="mobile-topbar-actions">
          <BuySubscription compact className="mobile-plus-button" />
          <PhotoSearchButton />
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
      <nav
        ref={nav}
        className={`mobile-bottom-nav${passVisible ? ' mobile-bottom-nav-pass' : ''}`}
        aria-label="Навигация"
        data-hidden={hidden}
        aria-hidden={hidden || undefined}
        inert={hidden}
        style={
          {
            '--nav-items': visibleItems.length,
            '--nav-active-index': Math.max(0, activeIndex),
          } as CSSProperties
        }
      >
        <span
          className="mobile-nav-active-pill"
          data-visible={activeIndex >= 0}
          aria-hidden="true"
        />
        {visibleItems.map((item) => {
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
                className={active ? 'active' : ''}
              >
                <HalloweenNavIcon kind={item.halloweenIcon}>
                  <Icon aria-hidden="true" />
                </HalloweenNavIcon>
                <span>{item.label}</span>
              </button>
            );
          }
          if (item.account)
            return <MobileProfileMenu key={item.label} active={active} />;
          return (
            <Link
              key={item.label}
              href={item.href}
              className={active ? 'active' : ''}
              aria-current={active ? 'page' : undefined}
              prefetch={false}
            >
              <HalloweenNavIcon kind={item.halloweenIcon}>
                <Icon aria-hidden="true" />
              </HalloweenNavIcon>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
