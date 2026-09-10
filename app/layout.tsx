import type { Metadata } from 'next';
import './globals.css';
import { CommunityProvider } from '@/components/community/context';
import './community.css';
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
        <CommunityProvider>{children}</CommunityProvider>
      </body>
    </html>
  );
}
