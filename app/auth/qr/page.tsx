import { NO_INDEX_ROBOTS } from '@/lib/seo';
import type { Metadata } from 'next';
import { QrConfirmation } from '@/components/community/qr-confirm';
export const metadata: Metadata = {
  title: 'Подтверждение входа',
  robots: NO_INDEX_ROBOTS,
  referrer: 'no-referrer',
};
export default function QrConfirmationPage() {
  return <QrConfirmation />;
}
