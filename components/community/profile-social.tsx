'use client';

import type { Profile } from '@/lib/community';
import { publicProfileSocial } from '@/lib/profile-social';

export function ProfileSocialLinks({ user }: { user: Profile }) {
  const visible = publicProfileSocial(user);
  if (!visible.vk_url && !visible.telegram_url) return null;
  return (
    <div className="profile-social-links" aria-label="Социальные сети">
      {visible.vk_url && (
        <a
          className="outline-button"
          href={visible.vk_url}
          target="_blank"
          rel="noopener noreferrer nofollow"
        >
          VK ↗
        </a>
      )}
      {visible.telegram_url && (
        <a
          className="outline-button"
          href={visible.telegram_url}
          target="_blank"
          rel="noopener noreferrer nofollow"
        >
          Telegram ↗
        </a>
      )}
    </div>
  );
}

export function ProfileSocialFields({
  draft,
  onChange,
}: {
  draft: Profile;
  onChange: (value: Profile) => void;
}) {
  return (
    <div className="profile-social-fields">
      <h3>Социальные сети</h3>
      <p>
        Укажи свои ссылки и выбери, какие показывать посетителям профиля. Это не
        меняет способы входа и настройки уведомлений.
      </p>
      {(['vk', 'telegram'] as const).map((provider) => {
        const urlKey = provider === 'vk' ? 'vk_url' : 'telegram_url';
        const showKey = provider === 'vk' ? 'show_vk' : 'show_telegram';
        const name = provider === 'vk' ? 'VK' : 'Telegram';
        return (
          <div key={provider}>
            <label>
              Ссылка на {name}
              <input
                type="text"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                maxLength={200}
                placeholder={
                  provider === 'vk'
                    ? 'https://vk.com/username'
                    : 'https://t.me/username'
                }
                value={draft[urlKey] || ''}
                onChange={(event) =>
                  onChange({ ...draft, [urlKey]: event.target.value })
                }
              />
            </label>
            <label className="hub-check">
              <input
                type="checkbox"
                checked={!!draft[showKey]}
                onChange={(event) =>
                  onChange({
                    ...draft,
                    [showKey]: event.target.checked ? 1 : 0,
                  })
                }
              />
              Показывать {name} в профиле
            </label>
          </div>
        );
      })}
      <small>Изменения сохраняются кнопкой «Сохранить» ниже.</small>
    </div>
  );
}
