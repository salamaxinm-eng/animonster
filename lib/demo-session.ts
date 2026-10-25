export type DemoProgress = {
  episode: number;
  position: number;
  voice: string;
  updatedAt: number;
};
export type DemoRoom = {
  code: string;
  host_id: string;
  episode: number;
  position: number;
  playing: boolean;
  rate: number;
  version: number;
  updated_at: number;
  expires_at: number;
};
export type DemoRoomSnapshot = {
  room: DemoRoom;
  host: boolean;
  serverTime: number;
  members: { nick: string; legend_origin_at?: number | null; user_id: string; online: boolean }[];
};

export function demoPosition(
  room: DemoRoom,
  serverTime: number,
  duration: number,
) {
  return Math.max(
    0,
    Math.min(
      duration,
      room.position +
        (room.playing
          ? (Math.max(0, serverTime - room.updated_at) * room.rate) / 1000
          : 0),
    ),
  );
}
export function validDemoProgress(value: unknown): value is DemoProgress {
  const item = value as DemoProgress | null;
  return (
    !!item &&
    Number.isInteger(item.episode) &&
    item.episode > 0 &&
    Number.isFinite(item.position) &&
    item.position >= 0 &&
    typeof item.voice === 'string' &&
    item.voice.length <= 100 &&
    Number.isSafeInteger(item.updatedAt) &&
    item.updatedAt > 0
  );
}
export const demoProgressKey = (userId?: string) =>
  `animonster-demo-progress-v2:${userId || 'guest'}`;

export function demoResumePoint(
  items: DemoProgress[],
  episodes: { number: number; duration: number }[],
) {
  const saved = items
    .filter(validDemoProgress)
    .filter((item) =>
      episodes.some((episode) => episode.number === item.episode),
    )
    .sort((a, b) => b.updatedAt - a.updatedAt)[0];
  if (!saved) return;
  const index = episodes.findIndex(
    (episode) => episode.number === saved.episode,
  );
  if (saved.position >= episodes[index].duration - 3)
    return {
      ...saved,
      episode: episodes[index + 1]?.number || saved.episode,
      position: 0,
    };
  return saved;
}
