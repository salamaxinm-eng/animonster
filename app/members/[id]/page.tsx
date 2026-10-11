import { PublicProfile } from '@/components/community/profile-hub/public-profile';
import '../../profile-hub.css';
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PublicProfile id={id} />;
}
