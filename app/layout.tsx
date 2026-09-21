import type { Metadata } from 'next';
import './globals.css';
import { CommunityProvider } from '@/components/community/context';
import { MobileNavigation } from '@/components/mobile-navigation';
import './community.css';
import './mobile.css';
import './rewards.css';

const SITE_URL = 'https://animonster.su';

export const metadata: Metadata = {
  verification: {
    yandex: '187ee239c4a4b040',
    google: '8Tus1LcrYSf-eIP4nAaWBcjSbwH6dEHDYjqGuCtQiXg',
  },

  metadataBase: new URL(SITE_URL),

  title: {
    default: 'AniMonster — смотреть аниме онлайн',
    template: '%s | AniMonster',
  },
  description:
    'Смотри аниме онлайн на AniMonster: каталог сериалов и фильмов, новинки, рекомендации, коллекции, достижения и обсуждения.',
  applicationName: 'AniMonster',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [{ url: '/icon.png', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  category: 'entertainment',
  keywords: [
    'аниме',
    'смотреть аниме онлайн',
    'аниме онлайн',
    'аниме сериалы',
    'аниме фильмы',
    'AniMonster',
  ],
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    url: '/',
    siteName: 'AniMonster',
    title: 'AniMonster — смотреть аниме онлайн',
    description:
      'Каталог аниме, новинки, рекомендации, коллекции, достижения и обсуждения.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AniMonster — смотреть аниме онлайн',
    description:
      'Каталог аниме, новинки, рекомендации, коллекции, достижения и обсуждения.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
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
