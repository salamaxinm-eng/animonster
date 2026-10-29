import { NO_INDEX_ROBOTS } from '@/lib/seo';
export const dynamic = 'force-dynamic';
export const metadata = { robots: NO_INDEX_ROBOTS, referrer: 'no-referrer' as const };
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
