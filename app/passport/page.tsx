import { redirect } from 'next/navigation';
import { serverPassportAccess } from '@/lib/passport-server-access';
import { PassportPage } from '@/components/anime-passport';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const access = await serverPassportAccess();
  if (!access?.own) redirect('/profile');
  return <PassportPage />;
}
