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


def main() -> int:
    parser = argparse.ArgumentParser(
        description="AniMonster auto-next v2: окно за 60 секунд + автозапуск следующей серии."
    )
    parser.add_argument("--repo", default=".")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    root = Path(args.repo).resolve()
    player = root / "components" / "episode-player.tsx"

    if not player.is_file():
        print("Не найден components/episode-player.tsx", file=sys.stderr)
        return 2

    old = player.read_text(encoding="utf-8")
    text = old

    try:
        text = replace_once(
            text,
            """  const autoNextTriggered = useRef('');
  const autoNextReadyAt = useRef(0);
  const episode = episodes[Math.min(index, episodes.length - 1)];""",
            """  const autoNextTriggered = useRef('');
  const autoNextReadyAt = useRef(0);
  const autoplayNextEpisode = useRef(false);
  const episode = episodes[Math.min(index, episodes.length - 1)];""",
            "autoplay ref",
        )

        text = replace_once(
            text,
            """  const changeEpisode = useCallback(
    (nextIndex: number, withoutReload = false) => {""",
            """  const changeEpisode = useCallback(
    (
      nextIndex: number,
      withoutReload = false,
      autoplay = false,
    ) => {""",
            "changeEpisode signature",
        )

        text = replace_once(
            text,
            """      if (!nextEpisode || nextEpisode.plus_locked) return;
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
        } else {""",
            """      if (!nextEpisode || nextEpisode.plus_locked) return;
      autoplayNextEpisode.current = autoplay;
      if (isKodik) {
        if (withoutReload && frame.current?.contentWindow) {
          frame.current.contentWindow.postMessage(
            {
              key: 'kodik_player_api',
              value: {
                method: 'change_episode',
                episode: nextEpisode.ordinal,
                without_reload: true,
              },
            },
            '*',
          );
          if (autoplay)
            window.setTimeout(() => {
              frame.current?.contentWindow?.postMessage(
                {
                  key: 'kodik_player_api',
                  value: { method: 'play' },
                },
                '*',
              );
            }, 300);
        } else {""",
            "Kodik API payload + play",
        )

        text = replace_once(
            text,
            """      autoNextRemaining >= 0 &&
      autoNextRemaining <= 5,""",
            """      autoNextRemaining >= 0 &&
      autoNextRemaining <= 60,""",
            "60 second window",
        )

        text = replace_once(
            text,
            """    changeEpisode(index + 1, isKodik);""",
            """    changeEpisode(index + 1, isKodik, true);""",
            "automatic transition autoplay",
        )

        text = replace_once(
            text,
            """                  changeEpisode(index + 1, isKodik);""",
            """                  changeEpisode(index + 1, isKodik, true);""",
            "watch now autoplay",
        )

        text = replace_once(
            text,
            """                  changeEpisode(index + 1);
                }
              }
            }}""",
            """                  changeEpisode(index + 1, false, true);
                }
              }
            }}""",
            "native ended autoplay",
        )

        text = replace_once(
            text,
            """                video.current.currentTime = Math.min(
                  initialPosition,
                  Math.max(0, video.current.duration - 1),
                );
              }
            }}""",
            """                video.current.currentTime = Math.min(
                  initialPosition,
                  Math.max(0, video.current.duration - 1),
                );
              }
              if (autoplayNextEpisode.current) {
                autoplayNextEpisode.current = false;
                void event.currentTarget.play().catch(() => {});
              }
            }}""",
            "native autoplay on metadata",
        )

    except RuntimeError as exc:
        print(f"Патч не применён: {exc}", file=sys.stderr)
        print(
            "Похоже, components/episode-player.tsx отличается от версии после первого патча.",
            file=sys.stderr,
        )
        return 3

    if args.dry_run:
        print("OK: v2-патч подходит. Файл не изменён.")
        return 0

    backup = player.with_suffix(player.suffix + ".v2.bak")
    shutil.copy2(player, backup)
    player.write_text(text, encoding="utf-8")

    print("Готово: auto-next v2 применён.")
    print("- окно появляется за 60 секунд до конца")
    print("- Kodik переключается через kodik_player_api/change_episode")
    print("- следующая серия запускается автоматически")
    print(f"- backup: {backup}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
