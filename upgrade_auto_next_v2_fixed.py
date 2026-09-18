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
            """      autoNextRemaining >= 0 &&
      autoNextRemaining <= 5,""",
            """      autoNextRemaining >= 0 &&
      autoNextRemaining <= 60,""",
            "60 second window",
        )

        text = replace_once(
            text,
            """    autoNextTriggered.current = key;
    changeEpisode(index + 1, isKodik);
  }, [""",
            """    autoNextTriggered.current = key;
    if (!isKodik) autoplayNextEpisode.current = true;
    changeEpisode(index + 1, isKodik);
  }, [""",
            "automatic transition autoplay",
        )

        text = replace_once(
            text,
            """                  autoNextTriggered.current = key;
                  changeEpisode(index + 1, isKodik);
                }}
              >""",
            """                  autoNextTriggered.current = key;
                  if (!isKodik) autoplayNextEpisode.current = true;
                  changeEpisode(index + 1, isKodik);
                }}
              >""",
            "watch now autoplay",
        )

        text = replace_once(
            text,
            """                  autoNextTriggered.current = key;
                  changeEpisode(index + 1);
                }
              }
            }}""",
            """                  autoNextTriggered.current = key;
                  autoplayNextEpisode.current = true;
                  changeEpisode(index + 1);
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
        print("Исходный файл не изменён.", file=sys.stderr)
        return 3

    if args.dry_run:
        print("OK: исправленный v2-патч подходит. Файл не изменён.")
        return 0

    backup = player.with_suffix(player.suffix + ".v2.bak")
    shutil.copy2(player, backup)
    player.write_text(text, encoding="utf-8")

    print("Готово: auto-next v2 применён.")
    print("- окно появляется за 60 секунд до конца")
    print("- отсчёт идёт от 60 до 1")
    print("- Kodik использует change_episode + without_reload=true")
    print("- Kodik должен сам начать следующую серию по своей API-команде")
    print("- обычный video-плеер принудительно запускает следующую серию")
    print(f"- backup: {backup}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
