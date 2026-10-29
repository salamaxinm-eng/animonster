import { NO_INDEX_FOLLOW } from '@/lib/seo';
export const metadata = { robots: NO_INDEX_FOLLOW };
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
