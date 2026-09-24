export const PLAYBACK_DIAGNOSTIC_CODES = [
  'iframe_error',
  'no_player_signal',
  'player_reported_error',
  'browser_offline',
] as const;

export type PlaybackDiagnosticCode = (typeof PLAYBACK_DIAGNOSTIC_CODES)[number];

const PHASES = ['load', 'playback', 'message', 'network'] as const;

export function normalizePlaybackDiagnostic(value: unknown) {
  const input = (value || {}) as Record<string, unknown>;
  const animeId = Number(input.anime_id);
  const episode = Number(input.episode);
  const code = String(input.code || '') as PlaybackDiagnosticCode;
  const phase = String(input.phase || '');
  const voiceover = String(input.voiceover || '').slice(0, 120);
  if (!Number.isInteger(animeId) || animeId < 1 || animeId > 999999999)
    return null;
  if (!Number.isInteger(episode) || episode < 1 || episode > 100000)
    return null;
  if (!PLAYBACK_DIAGNOSTIC_CODES.includes(code)) return null;
  if (!(PHASES as readonly string[]).includes(phase)) return null;
  if (!voiceover.startsWith('kodik:')) return null;
  const rawDetails =
    input.details && typeof input.details === 'object'
      ? (input.details as Record<string, unknown>)
      : {};
  const playerCode = String(rawDetails.player_code || '')
    .replace(/[^a-zA-Z0-9_.:-]/g, '')
    .slice(0, 64);
  return {
    provider: 'kodik' as const,
    animeId,
    episode,
    voiceover,
    code,
    phase,
    details: {
      online: rawDetails.online !== false,
      visibility:
        rawDetails.visibility === 'hidden'
          ? ('hidden' as const)
          : ('visible' as const),
      iframe_loaded: rawDetails.iframe_loaded === true,
      elapsed_ms: Math.max(
        0,
        Math.min(120000, Math.floor(Number(rawDetails.elapsed_ms) || 0)),
      ),
      ...(playerCode ? { player_code: playerCode } : {}),
    },
  };
}
