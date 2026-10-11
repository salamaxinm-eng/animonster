'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CommunityHeader, useCommunity } from './context';
import {
  HubNavigation,
  sections,
  type Section,
} from './profile-hub/navigation';
import {
  ResourceState,
  useResource,
  type HubProfile,
} from './profile-hub/shared';
import { OverviewSection } from './profile-hub/overview-section';
import { AnimeListSection } from './profile-hub/anime-list-section';
import { HistorySection } from './profile-hub/history-section';
import { CollectionSection } from './profile-hub/collection-section';
import { AchievementsSection } from './profile-hub/achievements-section';
import { AppearanceSection } from './profile-hub/appearance-section';
import { ActivitySection } from './profile-hub/activity-section';
import { SubscriptionSection } from './profile-hub/subscription-section';
import { SettingsSection } from './profile-hub/settings-section';

const legacySections: Record<string, string> = {
  wall: 'overview',
  collection: 'list',
  rewards: 'collection',
  settings: 'settings',
  notifications: 'settings',
};
export function ProfileHub() {
  const params = useSearchParams();
  const router = useRouter();
  const community = useCommunity();
  const [revision, setRevision] = useState(0);
  const [paymentNotice, setPaymentNotice] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const paymentChecked = useRef(false);
  const requested =
    params.get('section') ||
    legacySections[params.get('tab') || ''] ||
    'overview';
  const section = (
    sections.some(([id]) => id === requested) ? requested : 'overview'
  ) as Section;
  const profile = useResource<HubProfile>(
    community.user
      ? `/api/community?action=profile&view=hub&id=${encodeURIComponent(community.user.id)}`
      : null,
    revision,
  );
  async function changed() {
    await community.refresh();
    setRevision((value) => value + 1);
  }
  useEffect(() => {
    if (params.get('tab') === 'moderation') {
      router.replace('/profile/classic?tab=moderation');
      return;
    }
    if (
      params.get('tab') === 'settings' &&
      window.location.hash === '#appearance-settings'
    )
      router.replace('/profile?section=appearance');
  }, [params, router]);
  useEffect(() => {
    if (params.get('payment') === 'failed')
      setPaymentError('Оплата не завершена.');
    if (params.get('auth') === 'failed')
      setPaymentError('Вход через VK не завершился. Попробуйте ещё раз.');
    if (
      params.get('payment') !== 'return' ||
      !community.user ||
      paymentChecked.current
    )
      return;
    paymentChecked.current = true;
    void fetch('/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'check' }),
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        setPaymentNotice(
          result.status === 'succeeded'
            ? 'AniMonster Plus активирован.'
            : result.status === 'canceled'
              ? 'Оплата отменена.'
              : 'Платёж ещё обрабатывается.',
        );
        await changed();
        router.replace('/profile?section=subscription');
      })
      .catch((cause) => setPaymentError(cause.message));
  }, [params, community.user?.id]);
  return (
    <div className="social-site profile-hub">
      <CommunityHeader account />
      {!community.loaded ? (
        <p className="hub-state" role="status">
          Проверяем аккаунт…
        </p>
      ) : !community.user ? (
        <main className="hub-guest">
          <h1>Личный кабинет</h1>
          <p>Войдите, чтобы увидеть свой список, историю и оформление.</p>
          <button className="hub-primary" onClick={community.login}>
            Войти в аккаунт
          </button>
        </main>
      ) : (
        <HubNavigation section={section} moderator={community.moderator}>
          {paymentNotice && (
            <p className="hub-notice" role="status">
              {paymentNotice}
            </p>
          )}
          {paymentError && (
            <p className="hub-error" role="alert">
              {paymentError}
            </p>
          )}
          {!profile.data || profile.data.user.id !== community.user.id ? (
            <ResourceState {...profile} />
          ) : profile.data.own ? (
            <>
              {section === 'overview' && (
                <OverviewSection profile={profile.data} revision={revision} />
              )}
              {section === 'list' && (
                <AnimeListSection
                  profile={profile.data}
                  revision={revision}
                  onChanged={changed}
                />
              )}
              {section === 'history' && <HistorySection />}
              {section === 'collection' && (
                <CollectionSection
                  user={profile.data.user}
                  revision={revision}
                />
              )}
              {section === 'achievements' && <AchievementsSection />}
              {section === 'appearance' && (
                <AppearanceSection profile={profile.data} onChanged={changed} />
              )}
              {section === 'activity' && <ActivitySection />}
              {section === 'subscription' && (
                <SubscriptionSection
                  user={profile.data.user}
                  onChanged={changed}
                />
              )}
              {section === 'settings' && (
                <SettingsSection user={profile.data.user} onChanged={changed} />
              )}
            </>
          ) : (
            <p className="hub-error" role="alert">
              Этот кабинет доступен только владельцу аккаунта.
            </p>
          )}
        </HubNavigation>
      )}
    </div>
  );
}
