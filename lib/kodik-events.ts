type MessageRecord = Record<string, unknown>;

const record = (value: unknown): MessageRecord | null =>
  value != null && typeof value === 'object'
    ? (value as MessageRecord)
    : null;

export function kodikEpisodeFromMessage(payload: unknown) {
  const message = record(payload);
  if (!message) return null;

  const key = String(message.key || '');
  const value = record(message.value);
  const data = record(message.data);
  const episodeValue =
    (key === 'kodik_player_current_episode' ? value?.episode : undefined) ??
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
