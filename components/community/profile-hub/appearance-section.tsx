'use client';
import { useEffect, useState } from 'react';
import { Check, Upload } from 'lucide-react';
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

function useFilePreview(file: File | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const preview = URL.createObjectURL(file);
    setUrl(preview);
    return () => URL.revokeObjectURL(preview);
  }, [file]);
  return url;
}
export function AppearanceSection({
  profile,
  onChanged,
}: {
  profile: HubProfile;
  onChanged: () => Promise<void>;
}) {
  const user = profile.user;
  const resource = useResource<{ cosmetics: Cosmetic[] }>(
    '/api/profile-hub?kind=inventory',
  );
  const [draft, setDraft] = useState<Profile>(user);
  const [tab, setTab] = useState('frame');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [backgroundFile, setBackgroundFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const avatarPreview = useFilePreview(avatarFile);
  const backgroundPreview = useFilePreview(backgroundFile);
  const items = resource.data?.cosmetics.filter((item) => item.unlocked) || [];
  useEffect(() => setDraft(user), [user]);
  function cancel() {
    setDraft(user);
    setAvatarFile(null);
    setBackgroundFile(null);
    setError('');
    setNotice('Изменения отменены');
  }
  function choose(item: Cosmetic) {
    if (item.kind === 'background') setBackgroundFile(null);
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
              ? 'bleach'
              : item.slug
            : item.slug,
    }));
    setNotice('');
  }
  function file(kind: 'avatar' | 'background', value?: File) {
    if (!value) return;
    const max = (kind === 'avatar' ? 2 : 5) * 1024 * 1024;
    if (value.size > max) {
      setError(`Размер файла: не более ${max / 1024 / 1024} МБ`);
      return;
    }
    setError('');
    if (kind === 'avatar') setAvatarFile(value);
    else setBackgroundFile(value);
    setNotice('');
  }
  const dirty =
    avatarFile ||
    backgroundFile ||
    [
      'avatar',
      'theme',
      'profile_background',
      'profile_frame',
      'pin',
      'tag',
    ].some((key) => draft[key as keyof Profile] !== user[key as keyof Profile]);
  const noneSelected =
    tab === 'frame'
      ? draft.profile_frame === 'none'
      : tab === 'background'
        ? !draft.profile_background && !backgroundFile
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
        }),
      );
      if (avatarFile) form.set('avatar', avatarFile);
      if (backgroundFile) form.set('background', backgroundFile);
      const response = await fetch('/api/profile-hub', {
        method: 'POST',
        body: form,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setAvatarFile(null);
      setBackgroundFile(null);
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
      <ProfileIdentity
        user={draft}
        preview
        avatarPreview={avatarPreview}
        backgroundPreview={backgroundPreview}
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
                }[tab]
              }
            </h2>
            {tab === 'avatar' ? (
              <>
                <p className="hub-lead">
                  {user.entitlements.can_change_avatar
                    ? 'PNG, JPEG или WebP, до 2 МБ.'
                    : 'Смена аватара откроется на 5 уровне или с AniMonster Plus.'}
                </p>
                <label className="hub-upload">
                  <Upload size={17} aria-hidden="true" />
                  Загрузить аватар
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    disabled={busy || !user.entitlements.can_change_avatar}
                    onChange={(event) => {
                      file('avatar', event.target.files?.[0]);
                      event.target.value = '';
                    }}
                  />
                </label>
                <div className="hub-item-grid">
                  {user.avatar.startsWith('custom:') && (
                    <button
                      className={`hub-choice ${draft.avatar === user.avatar && !avatarFile ? 'selected' : ''}`}
                      aria-pressed={draft.avatar === user.avatar && !avatarFile}
                      disabled={busy}
                      onClick={() => {
                        setAvatarFile(null);
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
                      className={`hub-choice ${draft.avatar === item.id && !avatarFile ? 'selected' : ''}`}
                      aria-pressed={draft.avatar === item.id && !avatarFile}
                      disabled={busy || !user.entitlements.can_change_avatar}
                      onClick={() => {
                        setAvatarFile(null);
                        setDraft({ ...draft, avatar: item.id });
                      }}
                    >
                      <Avatar avatar={item.id} />
                      <span>{item.name}</span>
                      {draft.avatar === item.id && !avatarFile && (
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
                {tab === 'background' && (
                  <label className="hub-upload">
                    <Upload size={17} aria-hidden="true" />
                    Загрузить свой фон
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      disabled={
                        busy || !user.entitlements.can_customize_profile
                      }
                      onChange={(event) => {
                        file('background', event.target.files?.[0]);
                        event.target.value = '';
                      }}
                    />
                    <small>
                      {user.entitlements.can_customize_profile
                        ? 'PNG, JPEG или WebP, до 5 МБ.'
                        : 'Загрузка своего фона доступна с Plus.'}
                    </small>
                  </label>
                )}
                <div className="hub-item-grid">
                  {tab === 'background' &&
                    user.profile_background?.startsWith('asset:') && (
                      <button
                        className={`hub-choice ${draft.profile_background === user.profile_background && !backgroundFile ? 'selected' : ''}`}
                        aria-pressed={
                          draft.profile_background ===
                            user.profile_background && !backgroundFile
                        }
                        disabled={busy}
                        onClick={() => {
                          setBackgroundFile(null);
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
                      if (tab === 'background') setBackgroundFile(null);
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
              disabled={busy || !dirty}
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
