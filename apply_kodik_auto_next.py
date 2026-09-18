#!/usr/bin/env python3
from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: ожидалось 1 совпадение, найдено {count}")
    return text.replace(old, new, 1)


def patch_episode_player(text: str) -> str:
    text = replace_once(
        text,
        """    [currentTime, setCurrentTime] = useState(0),
    [kodikDuration, setKodikDuration] = useState<number | null>(null),
    [iframeSeek, setIframeSeek] = useState<number | null>(null),""",
        """    [currentTime, setCurrentTime] = useState(0),
    [nativeDuration, setNativeDuration] = useState<number | null>(null),
    [kodikDuration, setKodikDuration] = useState<number | null>(null),
    [kodikFrameEpisode, setKodikFrameEpisode] = useState(initialEpisode),
    [iframeSeek, setIframeSeek] = useState<number | null>(null),""",
        "state: duration",
    )

    text = replace_once(
        text,
        """    [autoSkip, setAutoSkip] = useState<boolean | null>(null),
    [preferenceReady, setPreferenceReady] = useState(false);""",
        """    [autoSkip, setAutoSkip] = useState<boolean | null>(null),
    [autoNextCancelled, setAutoNextCancelled] = useState(false),
    [preferenceReady, setPreferenceReady] = useState(false);""",
        "state: auto next",
    )

    text = replace_once(
        text,
        """  const skippedSegment = useRef('');
  const episode = episodes[Math.min(index, episodes.length - 1)];""",
        """  const skippedSegment = useRef('');
  const autoNextTriggered = useRef('');
  const autoNextReadyAt = useRef(0);
  const episode = episodes[Math.min(index, episodes.length - 1)];""",
        "refs",
    )

    text = replace_once(
        text,
        """  useEffect(() => {
    if (index > lastVoiceoverIndex) setIndex(lastVoiceoverIndex);
  }, [voiceoverId, lastVoiceoverIndex]);""",
        """  useEffect(() => {
    if (index <= lastVoiceoverIndex) return;
    const nextEpisode = episodes[lastVoiceoverIndex];
    if (nextEpisode) {
      setKodikFrameEpisode(nextEpisode.ordinal);
      setIframeSeek(null);
    }
    setIndex(lastVoiceoverIndex);
  }, [index, lastVoiceoverIndex, episodes]);
  const changeEpisode = useCallback(
    (nextIndex: number, withoutReload = false) => {
      if (nextIndex < 0 || nextIndex > lastVoiceoverIndex) return;
      const nextEpisode = episodes[nextIndex];
      if (!nextEpisode || nextEpisode.plus_locked) return;
      if (isKodik) {
        if (withoutReload && frame.current?.contentWindow) {
          frame.current.contentWindow.postMessage(
            {
              method: 'change_episode',
              episode: nextEpisode.ordinal,
              without_reload: true,
            },
            '*',
          );
        } else {
          setKodikFrameEpisode(nextEpisode.ordinal);
          setIframeSeek(null);
          setIframeRevision((value) => value + 1);
        }
      }
      setCurrentTime(0);
      setNativeDuration(null);
      setKodikDuration(null);
      setAutoNextCancelled(false);
      autoNextReadyAt.current = Date.now() + 1500;
      setIndex(nextIndex);
    },
    [episodes, isKodik, lastVoiceoverIndex],
  );""",
        "changeEpisode",
    )

    text = replace_once(
        text,
        """  useEffect(() => {
    setCurrentTime(0);
    setKodikDuration(null);
    setIframeSeek(null);
    setSkipTimes({ source: 'none', confidence: 'unverified' });
    skippedSegment.current = '';
  }, [episode?.id, voiceover?.id, isKodik]);""",
        """  useEffect(() => {
    setCurrentTime(0);
    setNativeDuration(null);
    setKodikDuration(null);
    if (!isKodik) setIframeSeek(null);
    setAutoNextCancelled(false);
    setSkipTimes({ source: 'none', confidence: 'unverified' });
    skippedSegment.current = '';
  }, [episode?.id, voiceover?.id, isKodik]);""",
        "reset episode state",
    )

    text = replace_once(
        text,
        """      url.searchParams.set('episode', String(episode.ordinal));
      const requestedPosition =
        iframeSeek ??
        (episode.ordinal === initialEpisode && initialPosition > 0
          ? initialPosition
          : 0);""",
        """      url.searchParams.set('episode', String(kodikFrameEpisode));
      const requestedPosition =
        iframeSeek ??
        (kodikFrameEpisode === initialEpisode && initialPosition > 0
          ? initialPosition
          : 0);""",
        "stable Kodik iframe URL",
    )

    text = replace_once(
        text,
        """    showAutoSkipQuestion =
      preferenceReady &&
      autoSkip == null &&
      activeKind === 'opening' &&
      autoSkipAllowed;""",
        """    showAutoSkipQuestion =
      preferenceReady &&
      autoSkip == null &&
      activeKind === 'opening' &&
      autoSkipAllowed,
    playbackDuration = isKodik
      ? kodikDuration || episode?.duration || null
      : nativeDuration || episode?.duration || null,
    nextEpisode =
      index < lastVoiceoverIndex ? episodes[index + 1] : undefined,
    autoNextRemaining =
      playbackDuration && currentTime > 0
        ? playbackDuration - currentTime
        : null,
    showAutoNext =
      !!nextEpisode &&
      !nextEpisode.plus_locked &&
      !autoNextCancelled &&
      autoNextRemaining != null &&
      autoNextRemaining >= 0 &&
      autoNextRemaining <= 5,
    autoNextSeconds = showAutoNext
      ? Math.max(1, Math.ceil(autoNextRemaining || 0))
      : null;""",
        "auto next derived state",
    )

    text = replace_once(
        text,
        """  const seekPast = (kind: 'opening' | 'ending', segment: SkipSegment) => {
    skippedSegment.current = `${episode?.id}:${voiceover?.id}:${kind}:${segment.stop}`;
    setCurrentTime(segment.stop);
    if (isKodik) {
      setIframeSeek(segment.stop);
      setIframeRevision((value) => value + 1);
    } else if (video.current) video.current.currentTime = segment.stop;
  };""",
        """  const seekPast = (kind: 'opening' | 'ending', segment: SkipSegment) => {
    skippedSegment.current = `${episode?.id}:${voiceover?.id}:${kind}:${segment.stop}`;
    setCurrentTime(segment.stop);
    if (isKodik) {
      if (episode) setKodikFrameEpisode(episode.ordinal);
      setIframeSeek(segment.stop);
      setIframeRevision((value) => value + 1);
    } else if (video.current) video.current.currentTime = segment.stop;
  };""",
        "Kodik seek source",
    )

    text = replace_once(
        text,
        """  useEffect(() => {
    if (!activeKind || !activeSegment || autoSkip !== true || !autoSkipAllowed)
      return;
    const key = `${episode?.id}:${voiceover?.id}:${activeKind}:${activeSegment.stop}`;
    if (skippedSegment.current === key) return;
    seekPast(activeKind, activeSegment);
  }, [
    activeKind,
    activeSegment?.stop,
    autoSkip,
    autoSkipAllowed,
    episode?.id,
    voiceover?.id,
  ]);
  return (""",
        """  useEffect(() => {
    if (!activeKind || !activeSegment || autoSkip !== true || !autoSkipAllowed)
      return;
    const key = `${episode?.id}:${voiceover?.id}:${activeKind}:${activeSegment.stop}`;
    if (skippedSegment.current === key) return;
    seekPast(activeKind, activeSegment);
  }, [
    activeKind,
    activeSegment?.stop,
    autoSkip,
    autoSkipAllowed,
    episode?.id,
    voiceover?.id,
  ]);
  useEffect(() => {
    if (
      !episode ||
      !nextEpisode ||
      nextEpisode.plus_locked ||
      autoNextCancelled ||
      !playbackDuration ||
      currentTime < 1 ||
      playbackDuration - currentTime > 1.25 ||
      playbackDuration - currentTime < -2 ||
      Date.now() < autoNextReadyAt.current
    )
      return;
    const key = `${episode.id}:${voiceover?.id || ''}`;
    if (autoNextTriggered.current === key) return;
    autoNextTriggered.current = key;
    changeEpisode(index + 1, isKodik);
  }, [
    episode?.id,
    nextEpisode?.id,
    nextEpisode?.plus_locked,
    autoNextCancelled,
    playbackDuration,
    currentTime,
    voiceover?.id,
    index,
    isKodik,
    changeEpisode,
  ]);
  return (""",
        "auto next effect",
    )

    text = replace_once(
        text,
        """              key={voiceover.id + ':' + episode.ordinal + ':' + iframeRevision}""",
        """              key={voiceover.id + ':' + iframeRevision}""",
        "stable iframe key",
    )

    text = replace_once(
        text,
        """            onLoadedMetadata={() => {
              if (
                video.current &&""",
        """            onLoadedMetadata={(event) => {
              setNativeDuration(event.currentTarget.duration);
              if (
                video.current &&""",
        "native duration",
    )

    text = replace_once(
        text,
        """            onEnded={() => {
              setPlayback(false);
              if (index < episodes.length - 1) setIndex(index + 1);
            }}""",
        """            onEnded={() => {
              setPlayback(false);
              if (
                !autoNextCancelled &&
                nextEpisode &&
                !nextEpisode.plus_locked
              ) {
                const key = `${episode?.id}:${voiceover?.id || ''}`;
                if (autoNextTriggered.current !== key) {
                  autoNextTriggered.current = key;
                  changeEpisode(index + 1);
                }
              }
            }}""",
        "native ended",
    )

    text = replace_once(
        text,
        """        {activeKind && activeSegment && !showAutoSkipQuestion && (""",
        """        {activeKind &&
          activeSegment &&
          !showAutoSkipQuestion &&
          !showAutoNext && (""",
        "skip/autonext collision",
    )

    text = replace_once(
        text,
        """        {showAutoSkipQuestion && activeSegment && (
          <div
            className="auto-skip-question"
            role="dialog"
            aria-label="Настройка автопропуска"
          >
            <strong>Пропускать опенинги и эндинги автоматически?</strong>
            <div>
              <button
                type="button"
                onClick={() => {
                  saveAutoSkip(true);
                  seekPast('opening', activeSegment);
                }}
              >
                Включить
              </button>
              <button type="button" onClick={() => saveAutoSkip(false)}>
                Нет
              </button>
            </div>
          </div>
        )}""",
        """        {showAutoSkipQuestion && activeSegment && (
          <div
            className="auto-skip-question"
            role="dialog"
            aria-label="Настройка автопропуска"
          >
            <strong>Пропускать опенинги и эндинги автоматически?</strong>
            <div>
              <button
                type="button"
                onClick={() => {
                  saveAutoSkip(true);
                  seekPast('opening', activeSegment);
                }}
              >
                Включить
              </button>
              <button type="button" onClick={() => saveAutoSkip(false)}>
                Нет
              </button>
            </div>
          </div>
        )}
        {showAutoNext && nextEpisode && (
          <div
            className="auto-next-card"
            role="status"
            aria-live="polite"
          >
            <strong>Следующая серия · {nextEpisode.ordinal}</strong>
            <span>Запуск через {autoNextSeconds} сек.</span>
            <div className="auto-next-actions">
              <button
                type="button"
                onClick={() => {
                  const key = `${episode?.id}:${voiceover?.id || ''}`;
                  autoNextTriggered.current = key;
                  changeEpisode(index + 1, isKodik);
                }}
              >
                Смотреть сейчас
              </button>
              <button
                type="button"
                onClick={() => setAutoNextCancelled(true)}
              >
                Отмена
              </button>
            </div>
          </div>
        )}""",
        "auto next UI",
    )

    text = replace_once(
        text,
        """            onChange={(e) => setVoiceoverId(e.target.value)}""",
        """            onChange={(e) => {
              const nextId = e.target.value;
              const nextVoiceover = voiceovers.find(
                (item) => item.id === nextId,
              );
              if (nextVoiceover?.provider === 'kodik' && episode) {
                setKodikFrameEpisode(episode.ordinal);
                setIframeSeek(null);
                setIframeRevision((value) => value + 1);
              }
              setVoiceoverId(nextId);
            }}""",
        "voiceover change",
    )

    text = replace_once(
        text,
        """          onChange={(e) => setIndex(Number(e.target.value))}""",
        """          onChange={(e) => changeEpisode(Number(e.target.value))}""",
        "episode select",
    )

    text = replace_once(
        text,
        """          onClick={() => setIndex(index - 1)}""",
        """          onClick={() => changeEpisode(index - 1)}""",
        "previous episode",
    )

    text = replace_once(
        text,
        """          onClick={() => setIndex(index + 1)}""",
        """          onClick={() => changeEpisode(index + 1)}""",
        "next episode",
    )

    return text


def patch_css(text: str) -> str:
    return replace_once(
        text,
        """.auto-skip-question button:first-child {
  background: #b4ed50;
  color: #152006;
  font-weight: 700;
}
.episode-toolbar {""",
        """.auto-skip-question button:first-child {
  background: #b4ed50;
  color: #152006;
  font-weight: 700;
}
.auto-next-card {
  position: absolute;
  z-index: 6;
  right: 18px;
  bottom: 58px;
  width: min(340px, calc(100% - 36px));
  padding: 15px;
  border: 1px solid #b4ed5066;
  border-radius: 10px;
  background: #0b1016f2;
  box-shadow: 0 12px 36px #000b;
  backdrop-filter: blur(10px);
}
.auto-next-card strong {
  display: block;
  color: #f3f7fb;
  font-size: 14px;
}
.auto-next-card > span {
  display: block;
  margin-top: 4px;
  color: #9cabbc;
  font-size: 12px;
}
.auto-next-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
.auto-next-actions button {
  min-height: 38px;
  padding: 0 13px;
  border-radius: 6px;
  background: #263344;
  color: #eef5ff;
  font-size: 12px;
}
.auto-next-actions button:first-child {
  background: #b4ed50;
  color: #152006;
  font-weight: 700;
}
.episode-toolbar {""",
        "auto next CSS",
    )


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Добавляет автопереключение серий AniMonster/Kodik без перезагрузки iframe."
    )
    parser.add_argument(
        "--repo",
        default=".",
        help="Путь к корню репозитория AniMonster (по умолчанию текущая папка).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Только проверить, что патч применим; файлы не менять.",
    )
    args = parser.parse_args()

    root = Path(args.repo).resolve()
    player = root / "components" / "episode-player.tsx"
    css = root / "app" / "community.css"

    if not player.is_file() or not css.is_file():
        print(
            "Не найден AniMonster. Запусти скрипт из корня репозитория "
            "или передай --repo /путь/к/animonster",
            file=sys.stderr,
        )
        return 2

    player_old = player.read_text(encoding="utf-8")
    css_old = css.read_text(encoding="utf-8")

    try:
        player_new = patch_episode_player(player_old)
        css_new = patch_css(css_old)
    except RuntimeError as exc:
        print(f"Патч не применён: {exc}", file=sys.stderr)
        print("Исходные файлы не изменены.", file=sys.stderr)
        return 3

    if args.dry_run:
        print("OK: патч подходит к текущей версии файлов. Изменения не записаны.")
        return 0

    shutil.copy2(player, player.with_suffix(player.suffix + ".bak"))
    shutil.copy2(css, css.with_suffix(css.suffix + ".bak"))

    player.write_text(player_new, encoding="utf-8")
    css.write_text(css_new, encoding="utf-8")

    print("Готово.")
    print("Изменены:")
    print("  components/episode-player.tsx")
    print("  app/community.css")
    print("")
    print("Резервные копии:")
    print("  components/episode-player.tsx.bak")
    print("  app/community.css.bak")
    print("")
    print("Дальше проверь: git diff && npm run build")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
