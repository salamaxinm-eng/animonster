'use client';

import { useEffect, useRef, useState, type PointerEvent } from 'react';
import {
  ClipboardPaste,
  FlipHorizontal2,
  ImagePlus,
  LoaderCircle,
  Trash2,
} from 'lucide-react';
import { exportPhoto, preparePhoto } from '@/lib/photo-search-image';
import {
  fitCrop,
  parseSceneMatches,
  record,
  sceneTime,
  traceError,
  TRACE_SEARCH_URL,
  UNCERTAIN_SIMILARITY,
  type Crop,
  type SceneMatch,
  type CatalogSceneMatch,
} from '@/lib/photo-search';

type Result = SceneMatch & { catalog?: CatalogSceneMatch };
const FULL: Crop = { x: 0, y: 0, width: 1, height: 1 };

export default function PhotoSearch() {
  const input = useRef<HTMLInputElement>(null);
  const resultSection = useRef<HTMLElement>(null);
  const errorSection = useRef<HTMLParagraphElement>(null);
  const controller = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  const version = useRef(0);
  const drag = useRef<{ x: number; y: number; crop: Crop } | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [filename, setFilename] = useState('');
  const [crop, setCrop] = useState<Crop>(FULL);
  const [aspect, setAspect] = useState('full');
  const [scale, setScale] = useState(90);
  const [phase, setPhase] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [results, setResults] = useState<Result[] | null>(null);
  const [mirrored, setMirrored] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [canPaste, setCanPaste] = useState(false);

  function cancel() {
    version.current++;
    controller.current?.abort();
    controller.current = null;
    busy.current = false;
  }

  async function choose(file?: File) {
    if (!file || !mounted.current) return;
    cancel();
    const current = version.current;
    const next = new AbortController();
    controller.current = next;
    busy.current = true;
    setPhase('Подготавливаем изображение…');
    setError('');
    setNotice('');
    setResults(null);
    setImage(null);
    setMirrored(false);
    try {
      const prepared = await preparePhoto(file, next.signal);
      if (version.current !== current) return;
      setImage(prepared);
      setFilename(file.name || 'Из буфера обмена');
      setCrop(FULL);
      setAspect('full');
      setScale(90);
    } catch (reason) {
      if (!next.signal.aborted && version.current === current)
        setError(
          reason instanceof Error
            ? reason.message
            : 'Не удалось открыть изображение.',
        );
    } finally {
      if (version.current === current) {
        setPhase('');
        busy.current = false;
      }
    }
  }

  useEffect(() => {
    mounted.current = true;
    setCanPaste(!!navigator.clipboard?.read);
    const paste = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.items || [])
        .find((item) => item.kind === 'file' && item.type.startsWith('image/'))
        ?.getAsFile();
      if (file) {
        event.preventDefault();
        void choose(file);
      }
    };
    document.addEventListener('paste', paste);
    return () => {
      mounted.current = false;
      document.removeEventListener('paste', paste);
      cancel();
    };
  }, []);

  async function pasteFromClipboard() {
    setNotice('');
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find((type) =>
          ['image/png', 'image/jpeg', 'image/webp'].includes(type),
        );
        if (type) {
          await choose(
            new File([await item.getType(type)], 'Из буфера обмена', { type }),
          );
          return;
        }
      }
      setNotice(
        'В буфере нет изображения. Скопируйте скриншот или загрузите файл.',
      );
    } catch {
      setNotice(
        'Не удалось прочитать буфер. Разрешите доступ в браузере, вставьте скриншот через Ctrl+V / ⌘V или загрузите файл.',
      );
    }
  }

  function updateCrop(
    nextAspect = aspect,
    nextScale = scale,
    x = 0.5,
    y = 0.5,
  ) {
    if (!image) return;
    setCrop(
      nextAspect === 'full'
        ? FULL
        : fitCrop(
            image.naturalWidth,
            image.naturalHeight,
            nextAspect === '16:9' ? 16 / 9 : 4 / 3,
            nextScale / 100,
            x,
            y,
          ),
    );
    setResults(null);
    setMirrored(false);
    setNotice('');
  }

  function beginDrag(event: PointerEvent<HTMLDivElement>) {
    if (aspect === 'full' || phase || !image) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, crop };
  }
  function moveCrop(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    const box = event.currentTarget.getBoundingClientRect();
    const start = drag.current;
    setCrop({
      ...start.crop,
      x: Math.max(
        0,
        Math.min(
          1 - crop.width,
          start.crop.x + (event.clientX - start.x) / box.width,
        ),
      ),
      y: Math.max(
        0,
        Math.min(
          1 - crop.height,
          start.crop.y + (event.clientY - start.y) / box.height,
        ),
      ),
    });
    setResults(null);
    setMirrored(false);
  }

  async function search(mirror = false) {
    if (!image || busy.current) return;
    cancel();
    busy.current = true;
    const current = version.current;
    const request = new AbortController();
    controller.current = request;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      request.abort();
    }, 45000);
    setError('');
    setNotice('');
    setResults(null);
    setMirrored(mirror);
    setPhase(mirror ? 'Ищем зеркальный кадр…' : 'Ищем аниме по кадру…');
    try {
      const blob = await exportPhoto(image, crop, mirror);
      if (request.signal.aborted || version.current !== current) return;
      const form = new FormData();
      form.append('image', blob, 'frame.jpg');
      const response = await fetch(TRACE_SEARCH_URL, {
        method: 'POST',
        body: form,
        signal: request.signal,
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        cache: 'no-store',
      });
      const raw = await response.text();
      if (raw.length > 2_000_000)
        throw new Error(
          'Сервис вернул слишком большой ответ. Попробуйте позже.',
        );
      let payload: unknown;
      try {
        payload = JSON.parse(raw);
      } catch {
        throw new Error(traceError(response.status, null));
      }
      if (!response.ok || record(payload).error)
        throw new Error(
          traceError(
            response.status,
            payload,
            response.headers.get('Retry-After'),
          ),
        );
      const matches = parseSceneMatches(payload);
      if (request.signal.aborted || version.current !== current) return;
      setResults(matches);
      if (matches.length) {
        setPhase('Проверяем каталог AniMonster…');
        try {
          const resolved = await fetch('/api/photo-search/resolve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ids: matches.map((item) => item.anilistId),
            }),
            signal: request.signal,
          });
          if (!resolved.ok) throw new Error('Catalog unavailable');
          const data = (await resolved.json()) as {
            results?: CatalogSceneMatch[];
          };
          if (version.current === current && !request.signal.aborted)
            setResults(
              matches.map((item) => ({
                ...item,
                catalog: data.results?.find(
                  (result) => result.anilistId === item.anilistId,
                ),
              })),
            );
        } catch {
          if (!request.signal.aborted && version.current === current)
            setNotice(
              'Кадры распознаны, но проверить каталог сейчас не удалось. Повторите проверку позже.',
            );
        }
      }
    } catch (reason) {
      if (version.current !== current) return;
      if (timedOut) setError('trace.moe не ответил вовремя. Попробуйте позже.');
      else if (!request.signal.aborted)
        setError(
          reason instanceof TypeError
            ? 'Не удалось связаться с trace.moe. Проверьте подключение или попробуйте позже.'
            : reason instanceof Error
              ? reason.message
              : 'Не удалось выполнить поиск.',
        );
    } finally {
      clearTimeout(timer);
      if (version.current === current) {
        setPhase('');
        busy.current = false;
      }
    }
  }

  const uncertain =
    results !== null &&
    (!results.length || results[0].similarity < UNCERTAIN_SIMILARITY);
  const x = crop.width < 0.999 ? crop.x / (1 - crop.width) : 0.5;
  const y = crop.height < 0.999 ? crop.y / (1 - crop.height) : 0.5;

  useEffect(() => {
    if (phase) return;
    if (error) errorSection.current?.scrollIntoView({ block: 'nearest' });
    else if (results !== null)
      resultSection.current?.scrollIntoView({ block: 'start' });
  }, [results, phase, error]);

  return (
    <div className="photo-search-body">
      <p className="photo-search-privacy">
        При нажатии «Найти аниме» выбранный кадр будет передан стороннему
        сервису{' '}
        <a href="https://trace.moe" target="_blank" rel="noreferrer">
          trace.moe
        </a>{' '}
        для распознавания. AniMonster не хранит загруженные изображения.
      </p>
      <input
        ref={input}
        className="sr-only"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label="Загрузить скриншот"
        onChange={(event) => {
          void choose(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      <div
        className={`photo-dropzone${dragging ? ' is-dragging' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void choose(event.dataTransfer.files[0]);
        }}
      >
        {!image && <p>Перетащи сюда скриншот или выбери файл</p>}
        <div className="photo-search-actions">
          <button
            type="button"
            className="photo-secondary"
            onClick={() => input.current?.click()}
          >
            <ImagePlus size={17} aria-hidden="true" />
            {image ? 'Заменить фото' : 'Загрузить фото'}
          </button>
          {canPaste && (
            <button
              type="button"
              className="photo-secondary"
              onClick={() => void pasteFromClipboard()}
            >
              <ClipboardPaste size={17} aria-hidden="true" />
              Вставить
            </button>
          )}
          {image && (
            <button
              type="button"
              className="photo-secondary"
              aria-label="Удалить изображение"
              onClick={() => {
                cancel();
                setImage(null);
                setResults(null);
                setPhase('');
                setError('');
                setNotice('');
              }}
            >
              <Trash2 size={17} aria-hidden="true" />
            </button>
          )}
        </div>
        {!image && (
          <small>
            JPG, PNG, WebP · до 12 МБ · можно вставить через Ctrl+V / ⌘V
          </small>
        )}
      </div>
      {image && (
        <>
          <div className="photo-crop-preview">
            <div
              className={`photo-crop-stage${aspect !== 'full' ? ' is-cropping' : ''}`}
              onPointerDown={beginDrag}
              onPointerMove={moveCrop}
              onPointerUp={() => {
                drag.current = null;
              }}
              onPointerCancel={() => {
                drag.current = null;
              }}
            >
              <img
                src={image.src}
                alt="Загруженный скриншот"
                draggable={false}
              />
              {aspect !== 'full' && (
                <span
                  className="photo-crop-selection"
                  style={{
                    left: crop.x * 100 + '%',
                    top: crop.y * 100 + '%',
                    width: crop.width * 100 + '%',
                    height: crop.height * 100 + '%',
                  }}
                />
              )}
            </div>
          </div>
          <small className="photo-filename">
            {filename} · {image.naturalWidth} × {image.naturalHeight}
          </small>
          <fieldset className="photo-crop-controls" disabled={!!phase}>
            <legend>Убери интерфейс видео и лишние надписи</legend>
            <label>
              Область кадра
              <select
                aria-label="Соотношение кадра"
                value={aspect}
                onChange={(event) => {
                  setAspect(event.target.value);
                  updateCrop(event.target.value);
                }}
              >
                <option value="full">Весь скриншот</option>
                <option value="16:9">Обрезать 16:9</option>
                <option value="4:3">Обрезать 4:3</option>
              </select>
            </label>
            {aspect !== 'full' && (
              <>
                <p>Перемести рамку пальцем, мышью или ползунками.</p>
                <label>
                  Размер области
                  <input
                    type="range"
                    min="20"
                    max="100"
                    value={scale}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      setScale(value);
                      updateCrop(aspect, value, x, y);
                    }}
                  />
                </label>
                <label>
                  По горизонтали
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={Math.round(x * 100)}
                    onChange={(event) =>
                      updateCrop(
                        aspect,
                        scale,
                        Number(event.target.value) / 100,
                        y,
                      )
                    }
                  />
                </label>
                <label>
                  По вертикали
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={Math.round(y * 100)}
                    onChange={(event) =>
                      updateCrop(
                        aspect,
                        scale,
                        x,
                        Number(event.target.value) / 100,
                      )
                    }
                  />
                </label>
              </>
            )}
          </fieldset>
          <button
            type="button"
            className="photo-primary"
            disabled={!!phase}
            onClick={() => void search()}
          >
            {phase ? (
              <LoaderCircle
                size={18}
                className="photo-spinner"
                aria-hidden="true"
              />
            ) : (
              <ImagePlus size={18} aria-hidden="true" />
            )}
            {phase || (results === null ? 'Найти аниме' : 'Повторить поиск')}
          </button>
          {phase && (
            <button
              type="button"
              className="photo-secondary"
              onClick={() => {
                cancel();
                setPhase('');
              }}
            >
              Отменить
            </button>
          )}
        </>
      )}
      <div role="status" aria-live="polite" className="photo-search-status">
        {phase}
        {notice && <p>{notice}</p>}
      </div>
      {error && (
        <p ref={errorSection} role="alert" className="photo-search-error">
          {error}
        </p>
      )}
      {results !== null && (
        <section
          ref={resultSection}
          className="photo-search-results"
          aria-label="Результаты распознавания"
        >
          <h3>{results.length ? 'Похожие кадры' : 'Совпадений не найдено'}</h3>
          {!results.length && (
            <p>Попробуй другой кадр или убери надписи и чёрные поля.</p>
          )}
          {!!results.length && (
            <p className="photo-search-hint">
              Сходство кадров — не вероятность правильного ответа. Номер серии
              указан trace.moe и может отличаться от нумерации в каталоге.
            </p>
          )}
          {results.map((item) => (
            <article className="photo-result" key={item.anilistId}>
              {item.image && (
                <img
                  src={item.image}
                  alt="Кадр из найденного аниме"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onError={(event) => {
                    event.currentTarget.hidden = true;
                  }}
                />
              )}
              <div>
                <h4>
                  {item.catalog?.anime?.title ||
                    item.catalog?.title ||
                    item.title}
                </h4>
                <p>Сходство кадров: {(item.similarity * 100).toFixed(1)}%</p>
                {item.similarity < UNCERTAIN_SIMILARITY && (
                  <p className="photo-uncertain">Совпадение неуверенное</p>
                )}
                {item.episode !== null && (
                  <p>Предположительно серия: {item.episode}</p>
                )}
                {item.from !== null && (
                  <p>
                    Сцена: {sceneTime(item.from)}
                    {item.to !== null ? '–' + sceneTime(item.to) : ''}
                  </p>
                )}
                {item.catalog?.anime ? (
                  <a
                    className="photo-watch"
                    href={'/anime/' + item.catalog.anime.id}
                  >
                    Смотреть на AniMonster
                  </a>
                ) : (
                  <p className="photo-search-hint">
                    {!item.catalog || item.catalog.unavailable
                      ? 'Не удалось проверить каталог'
                      : item.catalog.unmatched
                        ? 'Не удалось надёжно сопоставить с каталогом'
                        : 'Пока нет в каталоге'}
                  </p>
                )}
              </div>
            </article>
          ))}
          {uncertain && !mirrored && (
            <button
              type="button"
              className="photo-secondary"
              disabled={!!phase}
              onClick={() => void search(true)}
            >
              <FlipHorizontal2 size={18} aria-hidden="true" />
              Попробовать зеркальный кадр
            </button>
          )}
          {mirrored && (
            <p className="photo-search-hint">
              Результаты для зеркального кадра.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
