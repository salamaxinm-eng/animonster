'use client';
import { FormEvent, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';

function commentLocation(scope: string, commentId: string) {
  const anchor = `#comment-${encodeURIComponent(commentId)}`;
  const wall = /^wall:([a-f0-9-]{36})$/.exec(scope);
  if (wall)
    return {
      href: `/members/${wall[1]}${anchor}`,
      label: 'Стена профиля',
    };
  const anime = /^anime:(\d+)(?::episode:(\d+)|:video:\d+)?$/.exec(scope);
  if (anime) {
    const episode = /:episode:(\d+)$/.exec(scope)?.[1];
    return {
      href: `/anime/${anime[1]}${episode ? `?episode=${episode}` : ''}${anchor}`,
      label: episode
        ? `Аниме #${anime[1]} · серия ${episode}`
        : `Аниме #${anime[1]}`,
    };
  }
  return { href: '#', label: 'Обсуждение' };
}

export function AdminTools() {
  const [data, setData] = useState<any>({
    can_manage_roles: false,
    invite_required: false,
    users: [],
    invites: [],
    reports: [],
    actions: [],
    comments: [],
  });
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const load = async () => {
    const response = await fetch('/api/admin');
    if (response.ok) setData(await response.json());
  };
  useEffect(() => {
    void load();
  }, []);
  async function createInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setCode('');
    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create_invite',
        label: form.get('label'),
        days: form.get('days'),
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error);
      return;
    }
    setCode(result.code);
    await load();
  }
  async function mutate(payload: Record<string, unknown>) {
    setError('');
    setMessage('');
    const response = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error);
      return;
    }
    if (payload.action === 'grant_plus')
      setMessage(
        `Plus выдан до ${new Date(Number(result.premium_until)).toLocaleDateString('ru-RU')}`,
      );
    else if (payload.action === 'role') setMessage('Роль обновлена');
    else setMessage('Изменение сохранено');
    await load();
  }
  async function saveSkipOverride(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await mutate({
      action: 'skip_override',
      anime_id: form.get('anime_id'),
      episode: form.get('episode'),
      voiceover: form.get('voiceover'),
      opening_start: form.get('opening_start'),
      opening_stop: form.get('opening_stop'),
      ending_start: form.get('ending_start'),
      ending_stop: form.get('ending_stop'),
    });
  }
  async function saveEditorial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    await mutate({
      action: 'editorial_save',
      id: form.get('id'),
      title: form.get('title'),
      description: form.get('description'),
      cover: form.get('cover'),
      anime_ids: form.get('anime_ids'),
      published: form.get('published') === 'on',
    });
    element.reset();
  }
  async function saveCharacter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    await mutate({
      action: 'character_save',
      id: form.get('id'),
      name: form.get('name'),
      image: form.get('image'),
      anime_id: form.get('anime_id'),
      active: true,
    });
    element.reset();
  }
  return (
    <div className="admin-tools">
      {data.invite_required && (
        <section className="social-panel">
          <h2>Приглашения в бету</h2>
          <form className="admin-inline-form" onSubmit={createInvite}>
            <Input name="label" placeholder="Для кого" maxLength={80} />
            <Input
              name="days"
              type="number"
              min={1}
              max={90}
              defaultValue={14}
              aria-label="Срок, дней"
            />
            <Button type="submit">Создать инвайт</Button>
          </form>
          {code && (
            <p className="invite-result">
              Скопируйте сейчас: <strong>{code}</strong>
            </p>
          )}
          {error && <p className="error-msg">{error}</p>}
          <p className="muted">
            Коды хранятся только в виде хеша и работают один раз.
          </p>
        </section>
      )}
      <section className="social-panel">
        <h2>Таймкоды заставок</h2>
        <p className="muted">
          Ручная корректировка имеет приоритет над AniLiberty и AniSkip.
          Оставьте озвучку <strong>*</strong>, чтобы применить ко всем
          источникам.
        </p>
        <form className="admin-skip-form" onSubmit={saveSkipOverride}>
          <Input
            name="anime_id"
            type="number"
            min={1}
            max={999999999}
            placeholder="ID аниме"
            required
          />
          <Input
            name="episode"
            type="number"
            min={1}
            max={100000}
            placeholder="Серия"
            required
          />
          <Input
            name="voiceover"
            defaultValue="*"
            placeholder="Озвучка или *"
            maxLength={100}
            required
          />
          <Input
            name="opening_start"
            type="number"
            min={0}
            step="0.001"
            placeholder="OP начало"
          />
          <Input
            name="opening_stop"
            type="number"
            min={0}
            step="0.001"
            placeholder="OP конец"
          />
          <Input
            name="ending_start"
            type="number"
            min={0}
            step="0.001"
            placeholder="ED начало"
          />
          <Input
            name="ending_stop"
            type="number"
            min={0}
            step="0.001"
            placeholder="ED конец"
          />
          <Button type="submit">Сохранить таймкод</Button>
        </form>
        {!!data.skip_overrides?.length && (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Аниме / серия</th>
                  <th>Озвучка</th>
                  <th>Опенинг</th>
                  <th>Эндинг</th>
                  <th aria-label="Действия" />
                </tr>
              </thead>
              <tbody>
                {data.skip_overrides.map((item: any) => (
                  <tr key={item.id}>
                    <td>
                      {item.anime_id} / {item.episode}
                    </td>
                    <td>{item.voiceover}</td>
                    <td>
                      {item.opening_start == null
                        ? '—'
                        : `${item.opening_start}–${item.opening_stop}`}
                    </td>
                    <td>
                      {item.ending_start == null
                        ? '—'
                        : `${item.ending_start}–${item.ending_stop}`}
                    </td>
                    <td>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          mutate({
                            action: 'skip_override_delete',
                            id: item.id,
                          })
                        }
                      >
                        Удалить
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="social-panel">
        <h2>Plus: серии и Telegram</h2>
        <p>
          Первичная синхронизация:{' '}
          <strong>
            {data.plus_state?.value === 'complete' ? 'готова' : 'не выполнена'}
          </strong>
          {' · '}ранний доступ:{' '}
          <strong>
            {data.plus_early_access_enabled ? 'включён' : 'выключен'}
          </strong>
        </p>
        <div className="dashboard-cards compact">
          <div>
            <strong>{Number(data.episode_access?.episodes || 0)}</strong>
            <span>серий отслеживается</span>
          </div>
          {(data.telegram_queue || []).map((item: any) => (
            <div key={item.status}>
              <strong>{Number(item.count)}</strong>
              <span>Telegram · {item.status}</span>
            </div>
          ))}
        </div>
        {data.episode_access?.last_seen && (
          <p className="muted">
            Последнее обнаружение:{' '}
            {new Date(Number(data.episode_access.last_seen)).toLocaleString(
              'ru-RU',
            )}
          </p>
        )}
      </section>
      <section className="social-panel">
        <h2>Авторские Plus-подборки</h2>
        <form className="admin-skip-form" onSubmit={saveEditorial}>
          <Input name="title" placeholder="Название" maxLength={120} required />
          <Input name="cover" type="url" placeholder="HTTPS-обложка" />
          <Input
            name="anime_ids"
            placeholder="ID аниме через запятую"
            required
          />
          <Input name="description" placeholder="Описание" maxLength={800} />
          <label>
            <input name="published" type="checkbox" /> Опубликовать
          </label>
          <Button type="submit">Создать подборку</Button>
        </form>
        {!!data.editorial_collections?.length && (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Название</th>
                  <th>Тайтлы</th>
                  <th>Статус</th>
                  <th aria-label="Действия" />
                </tr>
              </thead>
              <tbody>
                {data.editorial_collections.map((item: any) => (
                  <tr key={item.id}>
                    <td>{item.title}</td>
                    <td>{item.anime_ids || '—'}</td>
                    <td>{item.published ? 'Опубликована' : 'Черновик'}</td>
                    <td>
                      <details>
                        <summary>Изменить</summary>
                        <form
                          className="admin-skip-form"
                          onSubmit={saveEditorial}
                        >
                          <input type="hidden" name="id" value={item.id} />
                          <Input
                            name="title"
                            defaultValue={item.title}
                            required
                          />
                          <Input
                            name="cover"
                            type="url"
                            defaultValue={item.cover || ''}
                            placeholder="HTTPS-обложка"
                          />
                          <Input
                            name="anime_ids"
                            defaultValue={item.anime_ids || ''}
                            required
                          />
                          <Input
                            name="description"
                            defaultValue={item.description || ''}
                          />
                          <label>
                            <input
                              name="published"
                              type="checkbox"
                              defaultChecked={!!item.published}
                            />{' '}
                            Опубликовать
                          </label>
                          <Button size="sm" type="submit">
                            Сохранить
                          </Button>
                        </form>
                      </details>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          void mutate({
                            action: 'editorial_delete',
                            id: item.id,
                          })
                        }
                      >
                        Удалить
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="social-panel">
        <h2>Справочник персонажей</h2>
        <form className="admin-skip-form" onSubmit={saveCharacter}>
          <Input
            name="name"
            placeholder="Имя персонажа"
            maxLength={100}
            required
          />
          <Input
            name="image"
            type="url"
            placeholder="HTTPS-изображение"
            required
          />
          <Input
            name="anime_id"
            type="number"
            min={1}
            placeholder="ID связанного аниме"
          />
          <Button type="submit">Добавить персонажа</Button>
        </form>
        {!!data.characters?.length && (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Персонаж</th>
                  <th>Аниме</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {data.characters.map((item: any) => (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td>{item.anime_id || '—'}</td>
                    <td>
                      <details>
                        <summary>Изменить</summary>
                        <form
                          className="admin-skip-form"
                          onSubmit={saveCharacter}
                        >
                          <input type="hidden" name="id" value={item.id} />
                          <Input
                            name="name"
                            defaultValue={item.name}
                            required
                          />
                          <Input
                            name="image"
                            type="url"
                            defaultValue={item.image}
                            required
                          />
                          <Input
                            name="anime_id"
                            type="number"
                            min={1}
                            defaultValue={item.anime_id || ''}
                          />
                          <Button size="sm" type="submit">
                            Сохранить
                          </Button>
                        </form>
                      </details>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          void mutate({
                            action: 'character_delete',
                            id: item.id,
                          })
                        }
                      >
                        Удалить
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="social-panel">
        <h2>Платежи Plus</h2>
        {data.payments?.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Пользователь</th>
                  <th>Статус</th>
                  <th>Создан</th>
                  <th>Plus до</th>
                </tr>
              </thead>
              <tbody>
                {data.payments.map((item: any) => (
                  <tr key={item.id}>
                    <td>
                      <a href={`/members/${item.user_id}`}>{item.nick}</a>
                    </td>
                    <td>{item.status}</td>
                    <td>
                      {new Date(Number(item.created_at)).toLocaleString(
                        'ru-RU',
                      )}
                    </td>
                    <td>
                      {item.expires
                        ? new Date(Number(item.expires)).toLocaleString('ru-RU')
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">Платежей пока нет.</p>
        )}
      </section>
      <section className="social-panel">
        <h2>Последние комментарии</h2>
        {data.comments.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Автор</th>
                  <th>Где написан</th>
                  <th>Комментарий</th>
                  <th>Дата</th>
                </tr>
              </thead>
              <tbody>
                {data.comments.map((comment: any) => {
                  const location = commentLocation(
                    String(comment.scope),
                    String(comment.id),
                  );
                  return (
                    <tr key={comment.id}>
                      <td>
                        <a href={`/members/${comment.user_id}`}>
                          {comment.nick}
                        </a>
                      </td>
                      <td>
                        <a href={location.href}>{location.label}</a>
                      </td>
                      <td className="admin-comment-preview">
                        {String(comment.body).slice(0, 300)}
                      </td>
                      <td>
                        {new Date(Number(comment.created_at)).toLocaleString(
                          'ru-RU',
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">Комментариев пока нет.</p>
        )}
      </section>
      <section className="social-panel">
        <h2>Пользователи</h2>
        {message && (
          <p role="status" className="success-msg">
            {message}
          </p>
        )}
        {error && (
          <p role="alert" className="error-msg">
            {error}
          </p>
        )}
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Пользователь</th>
                <th>Роль</th>
                <th>Email</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((user: any) => (
                <tr key={user.id}>
                  <td>
                    <a href={`/members/${user.id}`}>{user.nick}</a>
                    <small>{user.id}</small>
                  </td>
                  <td>
                    {data.can_manage_roles ? (
                      <NativeSelect
                        aria-label={`Роль ${user.nick}`}
                        value={user.role}
                        onChange={(event) =>
                          mutate({
                            action: 'role',
                            user_id: user.id,
                            role: event.target.value,
                          })
                        }
                      >
                        <option value="user">Пользователь</option>
                        <option value="moderator">Модератор</option>
                        <option value="admin">Администратор</option>
                      </NativeSelect>
                    ) : (
                      user.role
                    )}
                  </td>
                  <td>
                    {user.email || 'VK'} {user.email_verified ? '✓' : ''}
                    <small>
                      {Number(user.premium_until) > Date.now()
                        ? `Plus до ${new Date(Number(user.premium_until)).toLocaleDateString('ru-RU')}`
                        : 'Бесплатный'}
                    </small>
                  </td>
                  <td className="admin-actions">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        mutate({
                          action: 'grant_plus',
                          user_id: user.id,
                          days: 30,
                          reason: 'Выдано администратором',
                        })
                      }
                    >
                      Выдать Plus на 30 дней
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        mutate({
                          action: 'suspend',
                          user_id: user.id,
                          hours: user.suspended_until ? 0 : 24,
                          reason: 'Решение модератора',
                        })
                      }
                    >
                      {user.suspended_until
                        ? 'Разблокировать'
                        : 'Блок на сутки'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
