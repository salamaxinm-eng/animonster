import type { CSSProperties } from 'react';
import {
  nicknameColors,
  validNicknameStyle,
  type NicknameStyle,
} from '@/lib/nickname-styles';
export function UserNickname({
  user,
}: {
  user: {
    nick: string;
    legend_origin_at?: number | string | null;
    nickname_style?: NicknameStyle | null;
  };
}) {
  const choice = validNicknameStyle(user.nickname_style)
    ? user.nickname_style
    : null;
  const gold =
    Number(user.legend_origin_at) > 0 && (!choice || choice.color === 'legend');
  const color = choice && nicknameColors.find((c) => c[0] === choice.color);
  const classes = gold
    ? 'nickname-legend-gold'
    : color
      ? `nickname-custom nickname-${choice!.effect}`
      : '';
  const style = color
    ? ({
        '--nick-color': color[2],
        '--nick-light': color[3],
        '--nick-accent': color[4],
      } as CSSProperties)
    : undefined;
  return (
    <span
      className={
        `${classes}${choice?.motion === false ? ' nickname-still' : ''}`.trim() ||
        undefined
      }
      style={style}
    >
      {user.nick}
    </span>
  );
}
