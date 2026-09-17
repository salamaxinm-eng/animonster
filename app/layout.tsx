import type { Metadata } from 'next';
import './globals.css';
import { CommunityProvider } from '@/components/community/context';
import { MobileNavigation } from '@/components/mobile-navigation';
import './community.css';
import './mobile.css';
export const metadata: Metadata = {
  title: 'AniMonster — твоя территория аниме',
  description:
    'Смотри аниме, обсуждай серии и собирай свою коллекцию на AniMonster.',
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" className="dark">
      <body>
        <CommunityProvider>
          {children}
          <footer className="site-footer">
            <span>© AniMonster</span>
            <nav>
              <a href="/legal/privacy">Конфиденциальность</a>
              <a href="/legal/terms">Пользовательское соглашение</a>
              <a href="/legal/prices">Цены и тарифы</a>
              <a href="/legal/support">Поддержка</a>
              <a href="/legal/rules">Правила</a>
              <a href="/legal/offer">Оферта</a>
              <a href="/legal/requisites">Реквизиты</a>
            </nav>
          </footer>
          <MobileNavigation />
        </CommunityProvider>
      </body>
    </html>
  );
}
