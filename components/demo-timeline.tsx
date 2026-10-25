'use client';
import { useEffect, useRef, useState } from 'react';
import { parseDemoPreviews, type DemoPreviewCue } from '@/lib/demo-preview';
import type { DemoChapter } from '@/lib/player-demo';
export function DemoTimeline({
  time,
  duration,
  buffered,
  preview,
  chapters,
  disabled,
  onSeek,
}: {
  time: number;
  duration: number;
  buffered: number;
  preview?: string;
  chapters?: DemoChapter[];
  disabled: boolean;
  onSeek: (value: number) => void;
}) {
  const [cues, setCues] = useState<DemoPreviewCue[]>([]);
  const [hover, setHover] = useState<number | null>(null);
  const [draft, setDraft] = useState<number | null>(null);
  const dragging = useRef(false),
    current = useRef<number | null>(null);
  useEffect(() => {
    setCues([]);
    if (!preview) return;
    const controller = new AbortController();
    void fetch(preview, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const text = await response.text();
        if (!controller.signal.aborted)
          setCues(
            parseDemoPreviews(text, new URL(preview, location.origin).href),
          );
      })
      .catch(() => {});
    return () => controller.abort();
  }, [preview]);
  const position = draft ?? time;
  const cue =
    hover === null
      ? undefined
      : cues.find((item) => hover >= item.start && hover < item.stop);
  const clock = (value: number) =>
    `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
  const hoverChapter =
    hover === null
      ? undefined
      : chapters?.find((item) => hover >= item.start && hover < item.stop);
  return (
    <div className="demo-timeline-wrap">
      {hover !== null && (
        <div
          className="demo-seek-preview"
          aria-hidden="true"
          style={{
            left: `clamp(80px,${duration ? (hover / duration) * 100 : 0}%,calc(100% - 80px))`,
          }}
        >
          {cue && (
            <div
              style={{
                width: cue.width,
                height: cue.height,
                backgroundImage: `url("${cue.url}")`,
                backgroundPosition: `-${cue.x}px -${cue.y}px`,
              }}
            />
          )}
          <span>
            {hoverChapter
              ? `Серия ${hoverChapter.episode} · ${clock(hover - hoverChapter.start)}`
              : clock(hover)}
          </span>
        </div>
      )}
      <input
        type="range"
        className="demo-timeline"
        aria-label="Позиция просмотра"
        disabled={disabled}
        min={0}
        max={duration || 1}
        step={0.1}
        value={Math.min(position, duration || 1)}
        style={{
          background: `linear-gradient(to right,var(--demo-accent) ${duration ? (position / duration) * 100 : 0}%,#ffffff66 0%,#ffffff66 ${duration ? (buffered / duration) * 100 : 0}%,#ffffff24 0%)`,
        }}
        onPointerMove={(event) => {
          if (disabled) return;
          const r = event.currentTarget.getBoundingClientRect();
          setHover(
            Math.max(
              0,
              Math.min(
                duration,
                ((event.clientX - r.left) / r.width) * duration,
              ),
            ),
          );
        }}
        onPointerLeave={() => {
          if (!dragging.current) setHover(null);
        }}
        onPointerDown={(event) => {
          dragging.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onChange={(event) => {
          const value = Number(event.target.value);
          if (dragging.current) {
            current.current = value;
            setDraft(value);
            setHover(value);
          } else onSeek(value);
        }}
        onPointerUp={() => {
          dragging.current = false;
          if (current.current !== null) onSeek(current.current);
          current.current = null;
          setDraft(null);
          setHover(null);
        }}
        onPointerCancel={() => {
          dragging.current = false;
          current.current = null;
          setDraft(null);
          setHover(null);
        }}
      />
      {!!chapters?.length && (
        <div className="demo-season-chapters" aria-label="Серии на общей шкале">
          {chapters.map((chapter) => (
            <button
              key={chapter.episode}
              disabled={disabled}
              aria-label={`Перейти к серии ${chapter.episode}`}
              aria-current={
                time >= chapter.start && time < chapter.stop
                  ? 'true'
                  : undefined
              }
              style={{
                flexBasis: `${((chapter.stop - chapter.start) / duration) * 100}%`,
              }}
              onClick={() => onSeek(chapter.start)}
            >
              <span>{String(chapter.episode).padStart(2, '0')}</span>
              <small>серия</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
