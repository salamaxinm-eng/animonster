import type { Metadata } from 'next';
import { NO_INDEX_ROBOTS } from '@/lib/seo';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Авторизация',
  robots: NO_INDEX_ROBOTS,
  referrer: 'no-referrer',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
