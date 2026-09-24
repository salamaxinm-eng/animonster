export type OfflineStatus =
  | 'queued'
  | 'downloading'
  | 'paused'
  | 'completed'
  | 'failed';

export type OfflineSegment = {
  id: string;
  fileName: string;
  remoteUrl: string;
  duration?: number;
  kind: 'segment' | 'map';
  downloaded: boolean;
  size: number;
  mimeType?: string;
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
  quality: 480 | 720 | 1080;
  voiceoverId: string;
  voiceoverName: string;
  provider: 'aniliberty';
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
  quality: 480 | 720 | 1080;
  voiceoverId: string;
  voiceoverName: string;
  provider: 'aniliberty';
  manifestUrl: string;
  expiresAt: number;
  offlineAccessUntil: number;
};
