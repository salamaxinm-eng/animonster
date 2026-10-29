'use client';
import { FeedbackMessage } from '@/components/feedback-message';
import { useState } from 'react';
import { api } from '../context';
import type { HubProfile } from './shared';
import { Art, backgroundUrl } from './shared';

export function CustomLists({
  profile,
  onChanged,
}: {
  profile: HubProfile;
  onChanged: () => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function action(kind: string, values: Record<string, unknown>) {
    setBusy(true);
    setError('');
    try {
      await api(kind, values);
      setName('');
      await onChanged();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function cover(id: string, file?: File) {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.set('kind', 'list_cover');
      form.set('list_id', id);
      form.set('image', file);
      const response = await fetch('/api/plus-assets', {
        method: 'POST',
        body: form,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      await onChanged();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="hub-custom-lists">
      <summary>
        Мои списки · {profile.lists.length} /{' '}
        {profile.user.entitlements.custom_list_limit}
      </summary>
      <div>
        {error && (
          <p className="hub-error" role="alert">
            <FeedbackMessage>{error}</FeedbackMessage>
          </p>
        )}
        {profile.lists.map((list) => (
          <div className="hub-custom-list" key={list.id}>
            {list.cover && <Art src={backgroundUrl(list.cover)} />}
            <strong>{list.name}</strong>
            <span>{list.item_count} аниме</span>
            {profile.user.entitlements.can_customize_lists && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  void action('list_update', {
                    id: list.id,
                    description: form.get('description'),
                    pinned: form.get('pinned') === 'on',
                  });
                }}
              >
                <label>
                  Описание
                  <textarea
                    name="description"
                    defaultValue={list.description}
                    maxLength={300}
                  />
                </label>
                <label className="hub-check">
                  <input
                    name="pinned"
                    type="checkbox"
                    defaultChecked={!!list.pinned}
                  />
                  Закрепить в профиле
                </label>
                <label className="hub-upload">
                  Обложка списка
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    disabled={busy}
                    onChange={(event) =>
                      void cover(list.id, event.target.files?.[0])
                    }
                  />
                </label>
                <button className="hub-button" disabled={busy}>
                  Сохранить список
                </button>
              </form>
            )}
            <button
              className="hub-button"
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    `Удалить список «${list.name}»? Аниме останутся в основном списке.`,
                  )
                )
                  void action('list_delete', { id: list.id });
              }}
            >
              Удалить список
            </button>
          </div>
        ))}
        <form
          className="hub-create-list"
          onSubmit={(event) => {
            event.preventDefault();
            void action('list_create', { name });
          }}
        >
          <label>
            Название нового списка
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              minLength={2}
              maxLength={30}
              required
            />
          </label>
          <button
            className="hub-primary"
            disabled={
              busy ||
              profile.lists.length >=
                profile.user.entitlements.custom_list_limit
            }
          >
            Создать список
          </button>
        </form>
      </div>
    </details>
  );
}
