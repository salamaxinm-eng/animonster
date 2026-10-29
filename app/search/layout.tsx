import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Поиск аниме',
  description: 'Поиск аниме по названию, жанрам и темам на AniMonster.',
  robots: { index: false, follow: true },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
