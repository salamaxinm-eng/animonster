import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { serverPassportAccess } from '@/lib/passport-server-access';
import { PassportPage } from '@/components/anime-passport';
export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ id: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const access = await serverPassportAccess(id);
  if (!access) return { title: 'Паспорт не найден', robots: { index: false, follow: false } };
  return {
    title: `Аниме-паспорт ${access.nick}`,
    description: `Аниме-паспорт ${access.nick} на AniMonster`,
    robots: { index: !!access.public, follow: !!access.public },
    ...(access.public ? { openGraph: {
      title: `Аниме-паспорт ${access.nick}`,
      description: 'Мой аниме-паспорт на AniMonster',
      images: [{ url: `/api/passport/image?id=${encodeURIComponent(id)}&format=wide`, width: 1200, height: 630 }],
    } } : {}),
  };
}
export default async function Page({ params }: Props) {
  const { id } = await params;
  const access = await serverPassportAccess(id);
  if (!access) notFound();
  return <PassportPage id={id} />;
}
