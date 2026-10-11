'use client';
import { useEffect, useState } from 'react';
import { api } from '../context';
import { Art, type HubProfile } from './shared';

export function ShowcaseEditor({
  profile,
  onChanged,
}: {
  profile: HubProfile;
  onChanged: () => Promise<void>;
}) {
  const [anime, setAnime] = useState(
    profile.anime_showcase.map((item) => `/anime/${item.anime_id}`).join('\n'),
  );
  const [characters, setCharacters] = useState(
    profile.character_showcase.map((item) => item.id),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    setAnime(
      profile.anime_showcase
        .map((item) => `/anime/${item.anime_id}`)
        .join('\n'),
    );
    setCharacters(profile.character_showcase.map((item) => item.id));
  }, [profile]);
  async function save() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const ids = anime
        .split(/[\s,]+/)
        .filter(Boolean)
        .map((value) => {
          const id =
            /^(?:https:\/\/animonster\.su)?\/anime\/(\d+)(?:[?#].*)?$/.exec(
              value,
            )?.[1] || /^\d+$/.exec(value)?.[0];
          if (!id)
            throw new Error('Укажите ссылку на страницу аниме или его номер.');
          return Number(id);
        });
      if (ids.length > 5)
        throw new Error('В витрине может быть до пяти аниме.');
      await api('showcase', { anime_ids: ids, character_ids: characters });
      await onChanged();
      setNotice('Витрина сохранена');
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="hub-showcase-editor">
      <summary>Настройка витрины Plus</summary>
      {!profile.user.entitlements.can_customize_profile ? (
        <p className="hub-lead">
          Витрина аниме и персонажей доступна с AniMonster Plus.
        </p>
      ) : (
        <div>
          <p className="hub-lead">
            В витрине можно показать до пяти аниме и до пяти персонажей. Это
            отдельная витрина профиля.
          </p>
          <label>
            Ссылки на аниме, по одной в строке
            <textarea
              value={anime}
              onChange={(event) => setAnime(event.target.value)}
              placeholder="/anime/…"
            />
          </label>
          <fieldset>
            <legend>Персонажи · {characters.length} / 5</legend>
            <div className="hub-character-options">
              {profile.characters.map((item) => (
                <label key={item.id}>
                  <Art src={item.image} />
                  <span>{item.name}</span>
                  <input
                    type="checkbox"
                    checked={characters.includes(item.id)}
                    disabled={
                      busy ||
                      (!characters.includes(item.id) && characters.length >= 5)
                    }
                    onChange={(event) =>
                      setCharacters((old) =>
                        event.target.checked
                          ? [...old, item.id]
                          : old.filter((id) => id !== item.id),
                      )
                    }
                  />
                </label>
              ))}
            </div>
          </fieldset>
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
          <button
            className="hub-primary"
            disabled={busy}
            onClick={() => void save()}
          >
            {busy ? 'Сохраняем…' : 'Сохранить витрину'}
          </button>
        </div>
      )}
    </details>
  );
}
