import type { Metadata } from 'next';
import { QrConfirmation } from '@/components/community/qr-confirm';
export const metadata: Metadata = {
  title: 'Подтверждение входа',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};
export default function QrConfirmationPage() {
  return <QrConfirmation />;
}
