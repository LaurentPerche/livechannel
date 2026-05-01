export type PlaybackMode = "fresh" | "catch_up" | "replay";

export interface Env {
  USERS_KV: KVNamespace;
  VIDEOS_KV: KVNamespace;
  PUSH_KV: KVNamespace;
  USER_SCHEDULER: DurableObjectNamespace;
  ASSETS: Fetcher;
  ENVIRONMENT?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REDIRECT_URI?: string;
  YOUTUBE_API_KEY?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  SESSION_SECRET?: string;
}

export interface User {
  id: string;
  googleSub: string;
  email: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiry: number;
  createdAt: string;
  updatedAt: string;
  subscriptionsSyncedAt?: string;
}

export interface Subscription {
  channelId: string;
  title: string;
  thumbnailUrl: string;
  lastCheckedAt?: string;
}

export interface Video {
  videoId: string;
  channelId: string;
  channelTitle: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  publishedAt: string;
  durationSeconds?: number;
  detectedAt: string;
}

export interface ReplayEntry {
  videoId: string;
  replayedAt: string;
}

export interface UserPlaybackState {
  userId: string;
  currentVideoId?: string;
  queue: string[];
  mode: PlaybackMode;
  seenVideoIds: string[];
  skippedVideoIds: string[];
  replayHistory: ReplayEntry[];
  lastInteractionAt: string;
  lastQueueBuildAt: string;
  lastPlayedChannelId?: string;
}

export interface VideoSummary {
  videoId: string;
  title: string;
  channelTitle: string;
  publishedAt: string;
  thumbnailUrl: string;
}

export interface ChannelStateResponse {
  current: VideoSummary | null;
  next: VideoSummary[];
  mode: PlaybackMode;
}

export interface PushSubscriptionRecord {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface NewVideoNotificationPayload {
  videoId: string;
  title: string;
  channelTitle: string;
  url: string;
}
