'use client';
import { FeedbackMessage } from '@/components/feedback-message';
import { useEffect, useRef, useState } from 'react';
import type { useDemoFeedback } from '@/hooks/use-demo-feedback';

export function DemoFeedbackDialog({
  feedback,
  onOpen,
  onClosed,
}: {
  feedback: ReturnType<typeof useDemoFeedback>;
  onOpen: () => void;
  onClosed: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    callbacks = useRef({ onOpen, onClosed });
  callbacks.current = { onOpen, onClosed };
  const [score, setScore] = useState(0),
    [comment, setComment] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [thanks, setThanks] = useState(false);
  const [blocked, setBlocked] = useState(true);
  useEffect(() => {
    const media = dialog.current?.parentElement?.querySelector('video') as
      | (HTMLVideoElement & {
          webkitDisplayingFullscreen?: boolean;
          webkitPresentationMode?: string;
        })
      | null;
    const update = () =>
      setBlocked(
        document.hidden ||
          !!document.fullscreenElement ||
          !!document.pictureInPictureElement ||
          !!media?.webkitDisplayingFullscreen ||
          ['fullscreen', 'picture-in-picture'].includes(
            media?.webkitPresentationMode || '',
          ),
      );
    const documentEvents = ['fullscreenchange', 'visibilitychange'],
      mediaEvents = [
        'webkitbeginfullscreen',
        'webkitendfullscreen',
        'webkitpresentationmodechanged',
        'enterpictureinpicture',
        'leavepictureinpicture',
      ];
    update();
    documentEvents.forEach((name) => document.addEventListener(name, update));
    mediaEvents.forEach((name) => media?.addEventListener(name, update));
    return () => {
      documentEvents.forEach((name) =>
        document.removeEventListener(name, update),
      );
      mediaEvents.forEach((name) => media?.removeEventListener(name, update));
    };
  }, []);
  useEffect(() => {
    if (feedback.eligible && !blocked && !dialog.current?.open) {
      dialog.current?.showModal();
      callbacks.current.onOpen();
    }
  }, [feedback.eligible, blocked]);
  function close() {
    if (busy) return;
    if (!thanks) feedback.dismiss();
    dialog.current?.close();
  }
  return (
    <dialog
      ref={dialog}
      className="demo-feedback-dialog"
      aria-labelledby="demo-feedback-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClose={() => callbacks.current.onClosed()}
    >
      {thanks ? (
        <section>
          <span className="demo-kicker">СПАСИБО ЗА ПОДДЕРЖКУ</span>
          <h2 id="demo-feedback-title">Отзыв сохранён</h2>
          <p>Твоя оценка поможет нам сделать плеер удобнее.</p>
          <button className="demo-feedback-submit" onClick={close}>
            Вернуться к просмотру
          </button>
        </section>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!score || busy) return;
            setBusy(true);
            setError('');
            void feedback
              .submit(score, comment)
              .then(() => setThanks(true))
              .catch((reason) => setError(reason.message))
              .finally(() => setBusy(false));
          }}
        >
          <span className="demo-kicker">УЖЕ ТРИ СЕРИИ ВМЕСТЕ</span>
          <h2 id="demo-feedback-title">Как тебе наш плеер?</h2>
          <p>
            Ты посмотрел большую часть трёх серий. Поделись впечатлениями — это
            поможет выбрать, что улучшать дальше.
          </p>
          <fieldset disabled={busy}>
            <legend>Твоя оценка от 1 до 10</legend>
            <div className="demo-feedback-scores">
              {Array.from({ length: 10 }, (_, index) => index + 1).map(
                (value) => (
                  <label key={value}>
                    <input
                      type="radio"
                      name="player-score"
                      value={value}
                      checked={score === value}
                      onChange={() => setScore(value)}
                      required
                    />
                    <span>{value}</span>
                  </label>
                ),
              )}
            </div>
            <div className="demo-feedback-scale">
              <span>Не понравилось</span>
              <span>Отлично</span>
            </div>
          </fieldset>
          <label className="demo-feedback-comment">
            Комментарий <span>необязательно</span>
            <textarea
              value={comment}
              maxLength={2000}
              rows={3}
              disabled={busy}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Что понравилось? Чего не хватает?"
            />
          </label>
          {error && (
            <p role="alert" className="demo-feedback-error">
              <FeedbackMessage>{error}</FeedbackMessage>
            </p>
          )}
          <div className="demo-feedback-actions">
            <button type="button" onClick={close} disabled={busy}>
              Позже
            </button>
            <button
              type="submit"
              className="demo-feedback-submit"
              disabled={!score || busy}
            >
              {busy ? 'Сохраняем…' : 'Отправить отзыв'}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}
