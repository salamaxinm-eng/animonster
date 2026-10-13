import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { CosmeticGenerator } from '@/components/cosmetic-generator';
import './generator.css';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const h = await headers();
  const host = h.get('host') || '';
  const local = process.env.NODE_ENV !== 'production' && /^localhost(?::\d+)?$/.test(host);
  const origin = local ? `http://${host}` : process.env.SITE_URL;
  if (!origin) notFound();
  const response = await fetch(`${origin}/api/cosmetic-generator`, { cache: 'no-store', headers: { cookie: h.get('cookie') || '' } });
  if (!response.ok) notFound();
  return <CosmeticGenerator />;
}
