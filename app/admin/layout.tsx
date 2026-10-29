import { NO_INDEX_ROBOTS } from '@/lib/seo';
export const dynamic = 'force-dynamic';
export const metadata = { robots: NO_INDEX_ROBOTS };
import type { ReactNode } from 'react';
import { AdminSurface } from '@/components/community/admin-surface';
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminSurface>{children}</AdminSurface>;
}
