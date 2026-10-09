import type { Metadata } from 'next';
import { VpnPage } from '@/components/vpn-page';
import './vpn.css';

export const metadata: Metadata = {
  title: 'VPN',
  description: 'Управление VPN-подпиской и устройствами AniMonster',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <VpnPage />;
}
