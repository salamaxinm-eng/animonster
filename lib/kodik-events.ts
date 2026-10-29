type MessageRecord = Record<string, unknown>;
export function kodikOriginAllowed(origin: string) {
  try {
    const url=new URL(origin), allowed=['kodik.info','kodik.biz','kodikres.com','kodikplayer.com','kodikonline.com','kodik.cc','aniqit.com'];
    return url.protocol==='https:' && allowed.some(host=>url.hostname===host||url.hostname.endsWith('.'+host));
  } catch { return false; }
}

const record = (value: unknown): MessageRecord | null =>
  value != null && typeof value === 'object' ? (value as MessageRecord) : null;

export function kodikEpisodeFromMessage(payload: unknown) {
  const message = record(payload);
  if (!message) return null;

  const key = String(message.key || '');
  const value = record(message.value);
  const data = record(message.data);
  const episodeValue =
    (key === 'kodik_player_current_episode'
      ? (value?.episode ?? message.value)
      : undefined) ??
    message.episode ??
    message.episode_number ??
    message.episodeNumber ??
    message.current_episode ??
    data?.episode;
  const episode = Number(episodeValue);
  const isEpisodeMessage =
    key === 'kodik_player_current_episode' ||
    key === 'kodik_player_episode_changed' ||
    message.event === 'change_episode' ||
    message.type === 'episode' ||
    episodeValue != null;

  return isEpisodeMessage && Number.isInteger(episode) && episode > 0
    ? episode
    : null;
}
