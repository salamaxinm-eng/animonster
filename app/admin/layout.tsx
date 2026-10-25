import type { ReactNode } from 'react';
import { AdminSurface } from '@/components/community/admin-surface';
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminSurface>{children}</AdminSurface>;
}
