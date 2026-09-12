import { ProfilePage } from '@/components/community/profile-page';

export const metadata = { title: 'Закладки — AniMonster' };

export default function BookmarksPage() {
  return <ProfilePage initialTab="collection" />;
}
