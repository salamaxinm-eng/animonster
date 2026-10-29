import { NO_INDEX_ROBOTS } from '@/lib/seo';
import type { Metadata } from 'next';
import { VpnPage } from '@/components/vpn-page';
import './vpn.css';

export const metadata: Metadata = {
  title: 'VPN',
  description: 'Управление VPN-подпиской и устройствами AniMonster',
  robots: NO_INDEX_ROBOTS,
};

export default function Page() {
  return <VpnPage />;
}
