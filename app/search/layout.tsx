import { NO_INDEX_FOLLOW } from '@/lib/seo';
import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Поиск аниме',
  description: 'Поиск аниме по названию, жанрам и темам на AniMonster.',
  robots: NO_INDEX_FOLLOW,
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
