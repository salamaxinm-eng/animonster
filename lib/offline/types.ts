export type OfflineStatus =
  | 'queued'
  | 'downloading'
  | 'paused'
  | 'completed'
  | 'failed';

export type OfflineSeason = {
  id: string;
  chapters: { episode: number; start: number; stop: number }[];
};
export type OfflineDemoSource = {
  mediaUrl: string;
  mediaSize: number;
  manifestUrl: string;
  subtitles: { url: string; title: string; language: string }[];
};

export type OfflineSegment = {
  id: string;
  fileName: string;
  remoteUrl: string;
  duration?: number;
  kind: 'segment' | 'map';
  downloaded: boolean;
  size: number;
  mimeType?: string;
  rangeStart?: number;
  rangeEnd?: number;
};

export type OfflineManifest = {
  playlist: string;
  segments: OfflineSegment[];
};

export type OfflineEpisode = {
  id: string;
  downloadId: string;
  animeId: number;
  animeTitle: string;
  animePoster: string;
  episode: number;
  duration?: number;
  quality: 360 | 480 | 720 | 1080;
  voiceoverId: string;
  voiceoverName: string;
  provider: 'aniliberty' | 'demo';
  season?: OfflineSeason;
  demoSource?: OfflineDemoSource;
  offlineSubtitles?: { fileName: string; title: string; language: string }[];
  position?: number;
  ownerId?: string;
  size: number;
  downloadedBytes: number;
  totalBytes?: number;
  speedBytesPerSecond?: number;
  status: OfflineStatus;
  error?: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  watchedAt?: number;
  mimeType: string;
  manifestData?: OfflineManifest;
  offlineAccessUntil: number;
};

export type OfflinePrepareResponse = {
  ok: true;
  downloadId: string;
  animeId: number;
  animeTitle: string;
  animePoster: string;
  episode: number;
  duration?: number;
  quality: 360 | 480 | 720 | 1080;
  voiceoverId: string;
  voiceoverName: string;
  provider: 'aniliberty' | 'demo';
  season?: OfflineSeason;
  mediaUrl?: string;
  mediaSize?: number;
  subtitles?: { url: string; title: string; language: string }[];
  manifestUrl: string;
  expiresAt: number;
  offlineAccessUntil: number;
};
