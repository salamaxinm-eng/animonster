import type { Metadata } from 'next';
import { NO_INDEX_ROBOTS } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Реферальная программа',
  robots: NO_INDEX_ROBOTS,
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
