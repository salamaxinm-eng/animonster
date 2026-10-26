'use client';
import { useHalloween } from '@/components/halloween';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { NicknameEditor } from './nickname-editor';
import { Check } from 'lucide-react';
import { avatars, themes, type Profile } from '@/lib/community';
import { Avatar } from '../context';
import { ProfileIdentity } from './profile-identity';
import { CosmeticVisual } from './cosmetic-visual';
import {
  Art,
  Empty,
  FilterTabs,
  ResourceState,
  equipped,
  useResource,
  type Cosmetic,
  type HubProfile,
} from './shared';
import { ShowcaseEditor } from './showcase-editor';

export function AppearanceSection({
  profile,
  onChanged,
}: {
  profile: HubProfile;
  onChanged: () => Promise<void>;
}) {
  const user = profile.user;
  const halloween = useHalloween();
  const resource = useResource<{ cosmetics: Cosmetic[] }>(
    '/api/profile-hub?kind=inventory',
  );
  const [draft, setDraft] = useState<Profile>(user);
  const params = useSearchParams();
  const [tab, setTab] = useState(params.get('appearance') === 'nickname' ? 'nickname' : 'frame');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const items = resource.data?.cosmetics.filter((item) => item.unlocked) || [];
  useEffect(() => setDraft(user), [user]);
  function cancel() {
    setDraft(user);
    setError('');
    setNotice('Изменения отменены');
  }
  function choose(item: Cosmetic) {
    setDraft((old) => ({
      ...old,
      [item.kind === 'frame'
        ? 'profile_frame'
        : item.kind === 'background'
          ? 'profile_background'
          : item.kind]:
        item.kind === 'background'
          ? item.image
          : item.kind === 'theme'
            ? item.slug === 'bleach-theme'
              ? 'v2-bleach'
              : item.slug
            : item.slug,
    }));
    setNotice('');
  }
  const dirty =
    [
      'avatar',
      'theme',
      'profile_background',
      'profile_frame',
      'pin',
      'tag',
      'nickname_style',
    ].some((key) => draft[key as keyof Profile] !== user[key as keyof Profile]);
  const noneSelected =
    tab === 'frame'
      ? draft.profile_frame === 'none'
      : tab === 'background'
        ? !draft.profile_background
        : !draft[tab as 'pin' | 'tag'];
  async function save() {
    if (busy || !dirty) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const background = items.find(
        (item) =>
          item.kind === 'background' &&
          (item.image === draft.profile_background ||
            item.slug === draft.profile_background),
      );
      const form = new FormData();
      form.set(
        'appearance',
        JSON.stringify({
          avatar: draft.avatar,
          theme: draft.theme,
          frame: draft.profile_frame,
          pin: draft.pin,
          tag: draft.tag,
          background: background?.slug || draft.profile_background,
          nickname_style: draft.nickname_style || null,
        }),
      );
      const response = await fetch('/api/profile-hub', {
        method: 'POST',
        body: form,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      await onChanged();
      setNotice('Оформление сохранено');
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <p className="hub-lead">
        Выбор меняет предпросмотр. Примените оформление кнопкой «Сохранить».
      </p>
      {halloween.active && <p className="hub-notice">До конца 3 ноября на сайте действует хэллоуинское оформление. Выбранная тема появится после праздника.</p>}
      <ProfileIdentity
        user={draft}
        preview
      />
      <ResourceState {...resource} />
      {error && (
        <p className="hub-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="hub-notice" role="status">
          {notice}
        </p>
      )}
      {!resource.loading && !resource.error && (
        <>
          <FilterTabs
            options={[
              ['avatar', 'Аватар'],
              ['background', 'Фон'],
              ['frame', 'Рамка'],
              ['pin', 'Пин'],
              ['tag', 'Тег'],
              ['theme', 'Тема'],
              ['nickname', 'Ник'],
            ]}
            value={tab}
            onChange={setTab}
            label="Элементы оформления"
          />
          <section className="hub-appearance-group">
            <h2>
              {
                {
                  avatar: 'Мой аватар',
                  background: 'Мои фоны',
                  frame: 'Мои рамки',
                  pin: 'Мои пины',
                  tag: 'Мои теги',
                  theme: 'Тема сайта',
                  nickname: 'Оформление ника',
                }[tab]
              }
            </h2>
            {tab === 'nickname' ? (
              <NicknameEditor user={user} value={draft.nickname_style || null} onChange={nickname_style => setDraft(old => ({...old,nickname_style}))} onChanged={onChanged} busy={busy}/>
            ) : tab === 'avatar' ? (
              <>
                <p className="hub-lead">Выберите аватар из каталога. Загрузка своих изображений отключена.</p>
                <div className="hub-item-grid">
                  {user.avatar.startsWith('custom:') && (
                    <button
                      className={`hub-choice ${draft.avatar === user.avatar ? 'selected' : ''}`}
                      aria-pressed={draft.avatar === user.avatar}
                      disabled={busy}
                      onClick={() => {
                        setDraft({ ...draft, avatar: user.avatar });
                      }}
                    >
                      <Avatar avatar={user.avatar} />
                      <span>Ваш аватар</span>
                    </button>
                  )}
                  {avatars.map((item) => (
                    <button
                      key={item.id}
                      className={`hub-choice ${draft.avatar === item.id ? 'selected' : ''}`}
                      aria-pressed={draft.avatar === item.id}
                      disabled={busy || !user.entitlements.can_change_avatar}
                      onClick={() => {
                        setDraft({ ...draft, avatar: item.id });
                      }}
                    >
                      <Avatar avatar={item.id} />
                      <span>{item.name}</span>
                      {draft.avatar === item.id && (
                        <Check size={16} />
                      )}
                    </button>
                  ))}
                </div>
              </>
            ) : tab === 'theme' ? (
              <div className="hub-item-grid">
                {themes
                  .filter(
                    (theme) =>
                      !theme.cosmetic ||
                      items.some((item) => item.slug === theme.cosmetic),
                  )
                  .map((theme) => (
                    <button
                      className={`hub-choice ${draft.theme === theme.id ? 'selected' : ''}`}
                      aria-pressed={draft.theme === theme.id}
                      key={theme.id}
                      disabled={busy}
                      onClick={() => setDraft({ ...draft, theme: theme.id })}
                    >
                      <span
                        className="hub-theme-swatch"
                        style={{ background: theme.color }}
                      />
                      <span>{theme.name}</span>
                    </button>
                  ))}
              </div>
            ) : (
              <>
                <div className="hub-item-grid">
                  {tab === 'background' &&
                    user.profile_background?.startsWith('asset:') && (
                      <button
                        className={`hub-choice ${draft.profile_background === user.profile_background ? 'selected' : ''}`}
                        aria-pressed={
                          draft.profile_background ===
                            user.profile_background
                        }
                        disabled={busy}
                        onClick={() => {
                          setDraft({
                            ...draft,
                            profile_background: user.profile_background,
                          });
                        }}
                      >
                        <Art
                          src={`/api/plus-assets/${user.profile_background.split(':')[1]}`}
                        />
                        <span>Ваш загруженный фон</span>
                      </button>
                    )}
                  <button
                    className={`hub-choice ${noneSelected ? 'selected' : ''}`}
                    aria-pressed={!!noneSelected}
                    disabled={busy}
                    onClick={() => {
                      setDraft({
                        ...draft,
                        [tab === 'frame'
                          ? 'profile_frame'
                          : tab === 'background'
                            ? 'profile_background'
                            : tab]: tab === 'frame' ? 'none' : null,
                      });
                    }}
                  >
                    <span>
                      Без{' '}
                      {tab === 'frame'
                        ? 'рамки'
                        : tab === 'background'
                          ? 'фона'
                          : tab === 'pin'
                            ? 'пина'
                            : 'тега'}
                    </span>
                  </button>
                  {items
                    .filter((item) => item.kind === tab)
                    .map((item) => (
                      <button
                        key={item.id}
                        className={`hub-choice ${equipped(item, draft) ? 'selected' : ''}`}
                        aria-pressed={equipped(item, draft)}
                        disabled={busy}
                        onClick={() => choose(item)}
                      >
                        <CosmeticVisual item={item} user={draft} />
                        <span>{item.name}</span>
                        {equipped(item, draft) && <Check size={16} />}
                      </button>
                    ))}
                </div>
                {!items.some((item) => item.kind === tab) && (
                  <Empty>
                    Других доступных предметов в этой категории пока нет.
                  </Empty>
                )}
              </>
            )}
          </section>
          <div className="hub-save">
            <button
              className="hub-button"
              disabled={busy || !dirty}
              onClick={cancel}
            >
              Отменить
            </button>
            <button
              className="hub-primary"
              disabled={busy || !dirty || (!!draft.nickname_style && !['default','legend'].includes(draft.nickname_style.color) && !user.nickname_unlocked)}
              onClick={() => void save()}
            >
              {busy ? 'Сохраняем…' : 'Сохранить'}
            </button>
          </div>
        </>
      )}
      <ShowcaseEditor profile={profile} onChanged={onChanged} />
    </>
  );
}
