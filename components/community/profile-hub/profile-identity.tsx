'use client';
import { UserNickname } from '@/components/user-nickname';
import Link from 'next/link';
import { Crown, Pencil } from 'lucide-react';
import type { Profile } from '@/lib/community';
import { Avatar, Pin, UserTag } from '../context';
import { Art, backgroundUrl, sectionHref } from './shared';
import { StreakDisplay } from '../streak-display';
import { ProfileSocialLinks } from '../profile-social';

export function ProfileIdentity({
  user,
  own = false,
  preview = false,
  avatarPreview,
  backgroundPreview,
}: {
  user: Profile;
  own?: boolean;
  preview?: boolean;
  avatarPreview?: string | null;
  backgroundPreview?: string | null;
}) {
  const Heading = preview ? 'h2' : 'h1';
  return (
    <section
      className={preview ? 'hub-appearance-preview' : 'hub-profile-card'}
      aria-label={preview ? 'Предпросмотр профиля' : 'Профиль пользователя'}
    >
      <div className="hub-cover">
        <Art
          src={backgroundPreview || backgroundUrl(user.profile_background)}
        />
        {preview && <span className="hub-preview-label">Предпросмотр</span>}
      </div>
      <div
        className={`hub-identity profile-frame-${user.profile_frame || 'none'}`}
      >
        {avatarPreview ? (
          <span className="user-avatar large">
            <img src={avatarPreview} alt="Предпросмотр аватара" />
          </span>
        ) : (
          <Avatar large avatar={user.avatar} theme={user.theme} />
        )}
        <div>
          <div className="hub-name">
            <Heading><UserNickname user={user}/></Heading>
            <div className="hub-profile-badges">
              <UserTag id={user.tag} />
              <Pin id={user.pin} />
              <StreakDisplay streak={user.streak} compact />
              {!!user.premium_until && (
                <span className="hub-plus">
                  <Crown size={13} aria-hidden="true" /> {user.plus_lifetime ? 'Plus навсегда' : 'Plus'}
                </span>
              )}
            </div>
          </div>
          <p className="hub-bio">{user.bio || 'Описание пока не добавлено.'}</p>
          <ProfileSocialLinks user={user} />
          {user.founder_number && (
            <small className="hub-founder">
              Founder #{String(user.founder_number).padStart(3, '0')}
            </small>
          )}
        </div>
        {own && !preview && (
          <Link className="hub-button" href={sectionHref('settings')}>
            <Pencil size={16} aria-hidden="true" />
            Редактировать профиль
          </Link>
        )}
      </div>
    </section>
  );
}
