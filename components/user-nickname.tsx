export function UserNickname({
  user,
}: {
  user: { nick: string; legend_origin_at?: number | string | null };
}) {
  return (
    <span
      className={
        Number(user.legend_origin_at) > 0 ? 'nickname-legend-gold' : undefined
      }
    >
      {user.nick}
    </span>
  );
}
