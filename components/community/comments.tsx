'use client';
import { useEffect, useState } from 'react';
import {
  ThumbsDown,
  Heart,
  Reply,
  Flag,
  Pin as PinIcon,
  Send,
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { NativeSelect } from '@/components/ui/native-select';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { api, useCommunity, Avatar, Pin } from './context';
type Comment = {
  id: string;
  scope: string;
  author_id: string;
  parent_id: string | null;
  body: string;
  spoiler: number;
  pinned: number;
  deleted: number;
  created_at: number;
  edited_at: number;
  nick: string;
  avatar: string;
  theme: string;
  pin: string | null;
  like_count: number;
  vote: number;
  dislike_count: number;
  score: number;
};
export function Comments({
  scope,
  closed = false,
}: {
  scope: string;
  closed?: boolean;
}) {
  const { user, login } = useCommunity(),
    [rows, setRows] = useState<Comment[]>([]),
    [text, setText] = useState(''),
    [spoiler, setSpoiler] = useState(false),
    [sort, setSort] = useState('new'),
    [reply, setReply] = useState<Comment | null>(null),
    [edit, setEdit] = useState<Comment | null>(null),
    [editing, setEditing] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [confirm, setConfirm] = useState<{ action: string; row: Comment } | null>(
      null,
    ),
    [notice, setNotice] = useState('');
  async function load() {
    try {
      const r = await api(
        'comments&scope=' + encodeURIComponent(scope) + '&sort=' + sort,
      );
      setRows(r);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setReply(null);
    setText('');
    api('comments&scope=' + encodeURIComponent(scope) + '&sort=' + sort)
      .then((r) => {
        if (alive) {
          setRows(r);
          setError('');
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [scope, sort]);
  async function act(action: string, data: Record<string, unknown>) {
    if (!user) {
      login();
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api(action, data);
      await load();
      if (action === 'comment') {
        setText('');
        setReply(null);
        setSpoiler(false);
      }
      if (action === 'report') setNotice('Жалоба отправлена модератору.');
      setConfirm(null);
      setEdit(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const owner = scope === 'wall:' + user?.id;
  return (
    <section className="discussion">
      <div className="discussion-heading">
        <h3>
          {scope.startsWith('wall:') ? 'Стенка профиля' : 'Обсуждение видео'}{' '}
          <span>{rows.length}</span>
        </h3>
        <NativeSelect
          aria-label="Сортировка комментариев"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="new">Сначала новые</option>
          <option value="popular">Популярные</option>
        </NativeSelect>
      </div>
      {user && (!closed || owner) ? (
        <form
          className="comment-form"
          onSubmit={(e) => {
            e.preventDefault();
            void act('comment', {
              scope,
              body: text,
              spoiler,
              parent_id: reply?.id,
            });
          }}
        >
          {reply && (
            <div className="reply-to">
              Ответ {reply.nick}
              <button type="button" onClick={() => setReply(null)}>
                Отменить
              </button>
            </div>
          )}
          <textarea
            aria-label="Ваш комментарий"
            placeholder="Поделись впечатлениями…"
            maxLength={2000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            required
          />
          <div className="comment-form-bottom">
            <label>
              <Checkbox
                checked={spoiler}
                onCheckedChange={(v) => setSpoiler(!!v)}
              />{' '}
              Есть спойлер
            </label>
            <span>{text.length}/2000</span>
            <button className="primary" disabled={busy || !text.trim()}>
              <Send size={15} /> Отправить
            </button>
          </div>
        </form>
      ) : (
        <div className="comment-login">
          {closed && !owner ? (
            'Владелец закрыл стенку для новых комментариев.'
          ) : (
            <button onClick={login}>
              Войди в аккаунт, чтобы написать комментарий →
            </button>
          )}
        </div>
      )}
      {error && (
        <p className="error-msg" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="success-msg" role="status">
          {notice}
        </p>
      )}
      {loading ? (
        <p className="muted">Загрузка обсуждения…</p>
      ) : !rows.length ? (
        <div className="discussion-empty">
          Пока тихо. Начни обсуждение первым.
        </div>
      ) : (
        rows.map((c) => (
          <article
            id={'comment-' + c.id}
            className={'comment ' + (c.parent_id ? 'is-reply' : '')}
            key={c.id}
          >
            <a href={'/members/' + c.author_id}>
              <Avatar avatar={c.avatar} theme={c.theme} />
            </a>
            <div className="comment-content">
              <Pin id={c.pin} />
              <div className="comment-meta">
                <a href={'/members/' + c.author_id}>{c.nick}</a>
                <time>
                  {new Date(c.created_at).toLocaleString('ru-RU', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
                {!!c.edited_at && <span>изменено</span>}
                {!!c.pinned && (
                  <span className="pinned-label">
                    <PinIcon size={12} /> Закреплено
                  </span>
                )}
              </div>
              {c.parent_id && (
                <p className="reply-context">
                  В ответ на комментарий{' '}
                  {rows.find((x) => x.id === c.parent_id)?.nick ||
                    'в обсуждении'}
                </p>
              )}
              {c.spoiler && !c.deleted ? (
                <details className="spoiler">
                  <summary>Спойлер — нажми, чтобы прочитать</summary>
                  <p>{c.body}</p>
                </details>
              ) : (
                <p className="comment-body">{c.body}</p>
              )}
              {!c.deleted && (
                <div className="comment-actions">
                  <button
                    disabled={busy}
                    className={c.vote === 1 ? 'liked' : ''}
                    onClick={() =>
                      act('like', { id: c.id, vote: c.vote === 1 ? 0 : 1 })
                    }
                  >
                    <Heart size={14} />
                    {c.like_count || 'Нравится'}
                  </button>
                  <button
                    disabled={busy}
                    className={c.vote === -1 ? 'liked' : ''}
                    aria-label="Дизлайк"
                    onClick={() =>
                      act('like', { id: c.id, vote: c.vote === -1 ? 0 : -1 })
                    }
                  >
                    <ThumbsDown size={14} />
                    {c.dislike_count}
                  </button>
                  <span className="vote-score">Рейтинг {c.score}</span>
                  <button
                    onClick={() => {
                      if (!user) login();
                      else {
                        setReply(c);
                        document
                          .querySelector('.comment-form textarea')
                          ?.scrollIntoView({
                            block: 'center',
                            behavior: 'smooth',
                          });
                      }
                    }}
                  >
                    <Reply size={14} /> Ответить
                  </button>
                  {user?.id === c.author_id && (
                    <button
                      onClick={() => {
                        setEdit(c);
                        setEditing(c.body);
                      }}
                    >
                      Изменить
                    </button>
                  )}
                  {(user?.id === c.author_id || owner) && (
                    <button
                      onClick={() => setConfirm({ action: 'delete', row: c })}
                    >
                      Удалить
                    </button>
                  )}
                  {owner && (
                    <button
                      onClick={() => act('pin', { id: c.id, value: !c.pinned })}
                    >
                      {c.pinned ? 'Открепить' : 'Закрепить'}
                    </button>
                  )}
                  {user?.id !== c.author_id && (
                    <button
                      aria-label="Пожаловаться"
                      onClick={() =>
                        user
                          ? setConfirm({ action: 'report', row: c })
                          : login()
                      }
                    >
                      <Flag size={13} />
                    </button>
                  )}
                </div>
              )}
            </div>
          </article>
        ))
      )}
      <Dialog open={!!edit} onOpenChange={(v) => !v && setEdit(null)}>
        <DialogContent>
          <DialogTitle>Изменить комментарий</DialogTitle>
          <textarea
            className="edit-comment"
            value={editing}
            onChange={(e) => setEditing(e.target.value)}
            maxLength={2000}
          />
          <button
            disabled={busy || !editing.trim()}
            className="primary"
            onClick={() => act('edit', { id: edit?.id, body: editing })}
          >
            Сохранить
          </button>
        </DialogContent>
      </Dialog>
      <Dialog open={!!confirm} onOpenChange={(v) => !v && setConfirm(null)}>
        <DialogContent>
          <DialogTitle>
            {confirm?.action === 'delete'
              ? 'Удалить комментарий?'
              : 'Отправить жалобу?'}
          </DialogTitle>
          <DialogDescription>
            {confirm?.action === 'delete'
              ? 'Текст будет скрыт из обсуждения.'
              : 'Модератор получит этот комментарий для проверки.'}
          </DialogDescription>
          <button
            className="primary"
            disabled={busy}
            onClick={() =>
              confirm && act(confirm.action, { id: confirm.row.id })
            }
          >
            Подтвердить
          </button>
        </DialogContent>
      </Dialog>
    </section>
  );
}
