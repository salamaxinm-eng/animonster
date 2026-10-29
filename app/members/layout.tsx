import type { Metadata } from 'next';
import { NO_INDEX_FOLLOW } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Профили участников',
  robots: NO_INDEX_FOLLOW,
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
